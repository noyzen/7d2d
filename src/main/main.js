const { app, BrowserWindow, Menu, nativeTheme, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WindowState = require('electron-window-state');
const { XMLParser } = require('fast-xml-parser');
const dgram = require('dgram');
const crypto = require('crypto');

let CWD;
if (app.isPackaged) {
  // For portable executables, electron-builder sets this env var to the directory of the original .exe.
  // This is the correct way to get the path for portable apps that extract themselves to a temp dir.
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    CWD = process.env.PORTABLE_EXECUTABLE_DIR;
  } else {
    // For installed applications, the exe is in the right place relative to other files.
    CWD = path.dirname(app.getPath('exe'));
  }
} else {
  // In development, the working directory is the project root.
  CWD = process.cwd();
}

// Paths
const LAUNCHER_FILES_PATH = path.join(CWD, 'LauncherFiles');
const SETTINGS_PATH = path.join(LAUNCHER_FILES_PATH, 'settings.json');
const MODS_PATH = path.join(CWD, 'Mods');
const DISABLED_MODS_PATH = path.join(CWD, 'DisabledMods');
const GAME_EXE_PATH = path.join(CWD, '7DaysToDie.exe');

// --- LAN CHAT CONSTANTS ---
const LAN_PORT = 47625; // Random port
const BROADCAST_ADDR = '255.255.255.255';
const BROADCAST_INTERVAL = 5000; // 5 seconds
const PEER_TIMEOUT = 12000; // 12 seconds
const INSTANCE_ID = crypto.randomUUID();

let lanSocket = null;
let broadcastInterval = null;
let peerCheckInterval = null;
let peers = new Map();
let currentUsername = 'Survivor';

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow;

function createWindow() {
  const mainWindowState = WindowState({
    defaultWidth: 1200,
    defaultHeight: 800
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 940,
    minHeight: 600,
    icon: path.join(__dirname, '../../appicon.png'),
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindowState.manage(mainWindow);

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximize-changed', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximize-changed', false));

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.on('ready', () => {
  createWindow();

  // Register shortcut to toggle DevTools
  globalShortcut.register('Control+Shift+I', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });
});

app.on('will-quit', () => {
  // Unregister all shortcuts.
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- Window Controls ---
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

// --- LAN Chat Logic ---
function updatePeer(id, name, address) {
  const now = Date.now();
  if (!peers.has(id)) {
    console.log(`New peer discovered: ${name} [${id}] at ${address}`);
  }
  peers.set(id, { name, lastSeen: now, status: 'online' });
}

function checkPeers() {
  const now = Date.now();
  let changed = false;
  for (const [id, peer] of peers.entries()) {
    if (peer.status === 'online' && now - peer.lastSeen > PEER_TIMEOUT) {
      peer.status = 'offline';
      changed = true;
      console.log(`Peer timed out: ${peer.name} [${id}]`);
    }
  }
  if (changed) {
    sendPeerUpdate();
  }
}

function sendPeerUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const peerList = Array.from(peers, ([id, value]) => ({ id, ...value }));
    mainWindow.webContents.send('lan:peer-update', {selfId: INSTANCE_ID, list: peerList});
  }
}

function broadcastPacket(type, payload) {
  if (!lanSocket) return;
  const message = Buffer.from(JSON.stringify({
    type,
    id: INSTANCE_ID,
    name: currentUsername,
    ...payload
  }));
  lanSocket.send(message, 0, message.length, LAN_PORT, BROADCAST_ADDR, (err) => {
    if (err) console.error('Broadcast error:', err);
  });
}

ipcMain.handle('lan:start-discovery', () => {
  if (lanSocket) {
    console.log('LAN discovery already active.');
    return;
  }
  
  lanSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  lanSocket.on('error', (err) => {
    console.error(`LAN socket error:\n${err.stack}`);
    lanSocket.close();
    lanSocket = null;
  });

  lanSocket.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString());
      if (!data.id || data.id === INSTANCE_ID) return; // Ignore self

      switch (data.type) {
        case 'heartbeat':
          updatePeer(data.id, data.name, rinfo.address);
          sendPeerUpdate();
          break;
        case 'message':
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lan:message-received', {
              id: data.id,
              name: data.name,
              text: data.text,
              timestamp: Date.now()
            });
          }
          break;
      }
    } catch (e) {
      console.warn(`Received malformed LAN packet from ${rinfo.address}:${rinfo.port}`);
    }
  });

  lanSocket.bind(LAN_PORT, () => {
    lanSocket.setBroadcast(true);
    console.log('LAN socket bound. Starting discovery...');

    // Start broadcasting our presence
    broadcastInterval = setInterval(() => broadcastPacket('heartbeat'), BROADCAST_INTERVAL);
    broadcastPacket('heartbeat'); // Immediate broadcast

    // Start checking for disconnected peers
    peerCheckInterval = setInterval(checkPeers, BROADCAST_INTERVAL);
  });
});

ipcMain.handle('lan:stop-discovery', () => {
  if (broadcastInterval) clearInterval(broadcastInterval);
  if (peerCheckInterval) clearInterval(peerCheckInterval);
  if (lanSocket) {
    lanSocket.close();
    lanSocket = null;
  }
  peers.clear();
  broadcastInterval = null;
  peerCheckInterval = null;
  console.log('LAN discovery stopped.');
});

ipcMain.handle('lan:set-username', (_, username) => {
  currentUsername = username;
  // Update our own entry for immediate reflection
  updatePeer(INSTANCE_ID, currentUsername, '127.0.0.1');
  sendPeerUpdate();
  broadcastPacket('heartbeat'); // Broadcast name change immediately
});

ipcMain.handle('lan:send-message', (_, messageText) => {
  if (messageText && messageText.trim().length > 0) {
    broadcastPacket('message', { text: messageText.trim() });
    // Also send it back to our own renderer for display
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lan:message-received', {
            id: INSTANCE_ID,
            name: currentUsername,
            text: messageText.trim(),
            timestamp: Date.now()
        });
    }
  }
});

// --- Launcher API ---

// Initial data check
ipcMain.handle('launcher:get-initial-data', () => {
  if (!fs.existsSync(LAUNCHER_FILES_PATH)) {
    return { error: `Required folder 'LauncherFiles' not found. Please ensure the launcher is in the game directory.` };
  }
  const bgPath = path.join(LAUNCHER_FILES_PATH, 'bg.jpg');
  const bgmPath = path.join(LAUNCHER_FILES_PATH, 'bgm.mp3');

  if (!fs.existsSync(bgPath) || !fs.existsSync(bgmPath)) {
    return { error: `bg.jpg or bgm.mp3 not found inside 'LauncherFiles'.` };
  }

  let settings = {};
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      currentUsername = settings.playerName || 'Survivor';
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }

  // Convert file paths to file URLs for the renderer
  return {
    success: true,
    bgPath: `file:///${bgPath.replace(/\\/g, '/')}`,
    bgmPath: `file:///${bgmPath.replace(/\\/g, '/')}`,
    settings
  };
});

// Save settings
ipcMain.handle('launcher:save-settings', async (_, settings) => {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    if (settings.playerName && settings.playerName !== currentUsername) {
      currentUsername = settings.playerName;
      // Update our own entry for immediate reflection
      updatePeer(INSTANCE_ID, currentUsername, '127.0.0.1');
      sendPeerUpdate();
      broadcastPacket('heartbeat'); // Broadcast name change immediately
    }
    return { success: true };
  } catch (e) {
    console.error("Failed to save settings:", e);
    return { success: false, error: e.message };
  }
});

let gameProcess = null;

// Launch game
ipcMain.handle('launcher:start-game', async (_, settings) => {
  if (gameProcess) {
    return { error: 'Game is already running.' };
  }
  if (!fs.existsSync(GAME_EXE_PATH)) {
    return { error: `7DaysToDie.exe not found in the launcher directory!` };
  }

  const { playerName, configEditorRules, registryEditorRules } = settings;

  // --- Apply config file edits before launching ---
  if (playerName && configEditorRules && configEditorRules.length > 0) {
    try {
      for (const rule of configEditorRules) {
        if (!rule.filePath || !rule.lineNumber || !rule.lineTemplate) {
          console.warn('Skipping incomplete config rule:', rule);
          continue;
        }
        if (!fs.existsSync(rule.filePath)) {
          throw new Error(`Config file not found: ${rule.filePath}`);
        }

        const fileContent = fs.readFileSync(rule.filePath, 'utf8');
        const lines = fileContent.split(/\r?\n/);
        
        const lineIndex = rule.lineNumber - 1;
        if (lineIndex < 0 || lineIndex >= lines.length) {
          throw new Error(`Line number ${rule.lineNumber} is out of bounds for file ${rule.filePath}`);
        }

        // --- NEW VALIDATION ---
        if (rule.lineMatch && typeof rule.lineMatch === 'string' && rule.lineMatch.trim() !== '') {
          const currentLine = lines[lineIndex];
          if (!currentLine.includes(rule.lineMatch)) {
            // Use path.basename to keep file path private and cleaner in the error message
            throw new Error(`Validation failed for ${path.basename(rule.filePath)}: Line ${rule.lineNumber} does not contain the expected text "${rule.lineMatch}". Edit was not applied.`);
          }
        }
        // --- END NEW VALIDATION ---

        const newContent = rule.lineTemplate.replace(/##7d2dlauncher-username##/g, playerName);
        lines[lineIndex] = newContent;

        fs.writeFileSync(rule.filePath, lines.join('\n'), 'utf8');
      }
    } catch (e) {
      console.error("Failed to apply config edits:", e);
      return { error: `Failed to update config: ${e.message}` };
    }
  }

  // --- Apply registry edits before launching (Windows Only) ---
  if (process.platform === 'win32' && playerName && registryEditorRules && registryEditorRules.length > 0) {
    try {
        for (const rule of registryEditorRules) {
            if (!rule.regPath || !rule.keyName || !rule.keyValueTemplate) {
                console.warn('Skipping incomplete registry rule:', rule);
                continue;
            }

            const newValue = rule.keyValueTemplate.replace(/##7d2dlauncher-username##/g, playerName);
            
            await new Promise((resolve, reject) => {
                const regProcess = spawn('reg', [
                    'add',
                    rule.regPath,
                    '/v',
                    rule.keyName,
                    '/d',
                    newValue,
                    '/f' // Force overwrite
                ]);

                let stderr = '';
                regProcess.stderr.on('data', (data) => {
                    stderr += data;
                });

                regProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`reg command failed with code ${code}: ${stderr}`));
                    }
                });

                regProcess.on('error', (err) => {
                    reject(err);
                });
            });
        }
    } catch (e) {
        console.error("Failed to apply registry edits:", e);
        return { error: `Failed to update registry: ${e.message}` };
    }
  }

  try {
    const child = spawn(GAME_EXE_PATH, [], {
      detached: true,
      stdio: 'ignore',
      cwd: CWD,
    });
    
    child.unref();
    gameProcess = child;

    if (settings.exitOnLaunch) {
      setTimeout(() => app.quit(), 500);
      return { success: true, action: 'quitting' };
    }

    mainWindow?.minimize();
    
    child.on('exit', (code) => {
      console.log(`Game process exited with code ${code}`);
      gameProcess = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        if(mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.focus();
        mainWindow.webContents.send('game:closed');
      }
    });

    return { success: true, action: 'minimized' };
  } catch (e) {
    console.error("Failed to launch game:", e);
    gameProcess = null;
    return { error: e.message };
  }
});

// Select config file
ipcMain.handle('launcher:select-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select Configuration File'
  });
  if (!canceled && filePaths.length > 0) {
    return { success: true, filePath: filePaths[0] };
  }
  return { success: false };
});


// Helper to read mod directories
const readModsFromDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) return [];
  const parser = new XMLParser();
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => {
      const modPath = path.join(dirPath, dirent.name);
      const xmlPath = path.join(modPath, 'ModInfo.xml');
      if (fs.existsSync(xmlPath)) {
        try {
          const xmlData = fs.readFileSync(xmlPath, 'utf8');
          const modInfo = parser.parse(xmlData).xml;
          return {
            folderName: dirent.name,
            name: modInfo.DisplayName?.['@_value'] || modInfo.Name?.['@_value'] || dirent.name,
            description: modInfo.Description?.['@_value'] || 'No description.',
            author: modInfo.Author?.['@_value'] || 'Unknown author.',
            version: modInfo.Version?.['@_value'] || 'N/A',
          };
        } catch (e) {
          console.error(`Error parsing ${xmlPath}:`, e);
          return { folderName: dirent.name, name: dirent.name, error: 'Could not parse ModInfo.xml' };
        }
      }
      return null;
    })
    .filter(Boolean); // remove nulls
};

// Get mods
ipcMain.handle('launcher:get-mods', () => {
  return {
    enabled: readModsFromDir(MODS_PATH),
    disabled: readModsFromDir(DISABLED_MODS_PATH),
  };
});

// Toggle mod
ipcMain.handle('launcher:toggle-mod', (_, { folderName, enable }) => {
  try {
    if (!fs.existsSync(DISABLED_MODS_PATH)) {
      fs.mkdirSync(DISABLED_MODS_PATH);
    }
    const sourcePath = path.join(enable ? DISABLED_MODS_PATH : MODS_PATH, folderName);
    const destPath = path.join(enable ? MODS_PATH : DISABLED_MODS_PATH, folderName);
    if (fs.existsSync(sourcePath)) {
      fs.renameSync(sourcePath, destPath);
      return { success: true };
    }
    return { success: false, error: 'Source mod folder not found.' };
  } catch (e) {
    console.error('Failed to toggle mod:', e);
    return { success: false, error: e.message };
  }
});