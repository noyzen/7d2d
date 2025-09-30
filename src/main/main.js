const { app, BrowserWindow, Menu, nativeTheme, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');
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
const SOURCE_DATA_PATH = path.join(app.getPath('appData'), '7DaysToDie');
const BACKUP_DATA_PATH = path.join(CWD, 'BackupData');


// --- LAN CHAT CONSTANTS ---
const LAN_PORT = 47625; // Random port
const BROADCAST_ADDR = '255.255.255.255';
const BROADCAST_INTERVAL = 5000; // 5 seconds
const PEER_TIMEOUT = 12000; // 12 seconds
const INSTANCE_ID = crypto.randomUUID();
const OS_USERNAME = os.userInfo().username;

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
  // Stop discovery before quitting
  if (broadcastInterval) clearInterval(broadcastInterval);
  if (peerCheckInterval) clearInterval(peerCheckInterval);
  if (lanSocket) {
    // Send a 'disconnect' message so others know we're leaving immediately
    broadcastPacket('disconnect');
    lanSocket.close();
    lanSocket = null;
  }
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
function updatePeer(id, name, osUsername, address) {
  const now = Date.now();
  const isNew = !peers.has(id);
  if (isNew) {
    console.log(`New peer discovered: ${name} (${osUsername}) [${id}] at ${address}`);
  }
  peers.set(id, { name, osUsername, lastSeen: now, status: 'online' });
  return isNew;
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
    osUsername: OS_USERNAME,
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
          const isNewPeer = updatePeer(data.id, data.name, data.osUsername, rinfo.address);
          sendPeerUpdate();
          // If we just discovered someone new, announce our presence immediately
          // to ensure bi-directional discovery.
          if (isNewPeer) {
            broadcastPacket('heartbeat');
          }
          break;
        case 'message':
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lan:message-received', {
              id: data.id,
              name: data.name,
              osUsername: data.osUsername,
              text: data.text,
              timestamp: Date.now()
            });
          }
          break;
        case 'disconnect':
          if (peers.has(data.id)) {
            peers.get(data.id).status = 'offline';
            console.log(`Peer disconnected gracefully: ${data.name} [${data.id}]`);
            sendPeerUpdate();
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
    broadcastPacket('disconnect');
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
  updatePeer(INSTANCE_ID, currentUsername, OS_USERNAME, '127.0.0.1');
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
            osUsername: OS_USERNAME,
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
    // Add default about page settings if they don't exist
    if (!settings.aboutPage) {
      settings.aboutPage = {
        title: 'About This Launcher',
        creator: 'Your Name Here',
        version: app.getVersion(),
        website: 'https://example.com',
        description: 'This is a custom launcher for 7 Days to Die, designed to provide a better user experience for managing mods, settings, and launching the game. Thank you for using it!'
      };
    } else {
      // Ensure version is always up-to-date
      settings.aboutPage.version = app.getVersion();
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
      updatePeer(INSTANCE_ID, currentUsername, OS_USERNAME, '127.0.0.1');
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

  const { playerName, configEditorRules, registryEditorRules, launchParameters } = settings;

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

  // --- Construct Launch Parameters ---
  const gameArgs = [];
  const LAUNCH_PARAM_TYPES = {
    'AllowCrossplay': 'bool', 'AllowJoinConfigModded': 'bool', 'LoadSaveGame': 'bool', 'LocalizationChecks': 'bool', 'NoXInput': 'bool', 'SkipNewsScreen': 'bool', 'PlayerPrefsFile': 'bool',
    'DebugNet': 'object', 'DebugPackages': 'object', 'ExportCustomAtlases': 'object', 'NoEAC': 'object', 'NoGameSense': 'object', 'NoLiteNetLib': 'object', 'NoRakNet': 'object', 'NoUNet': 'object', 'Quick-Continue': 'object', 'SkipIntro': 'object', 'DisableNativeInput': 'object', 'Submission': 'object',
    'CrossPlatform': 'string', 'DebugAchievements': 'string', 'DebugEAC': 'string', 'DebugEOS': 'string', 'DebugInput': 'string', 'DebugSessions': 'string', 'DebugShapes': 'string', 'DebugXui': 'string', 'Language': 'string', 'LogFile': 'string', 'NewPrefabsMod': 'string', 'Platform': 'string', 'ServerPlatforms': 'string', 'SessionInvite': 'string', 'UserDataFolder': 'string', 'MapChunkDatabase': 'string',
    'MaxWorldSizeClient': 'string', 'MaxWorldSizeHost': 'string',
    'dedicated': 'flag'
  };

  if (launchParameters) {
    for (const key in launchParameters) {
        const value = launchParameters[key];
        const type = LAUNCH_PARAM_TYPES[key];
        if (!type) continue;

        switch (type) {
            case 'bool':
                gameArgs.push(`-${key}=${value}`);
                break;
            case 'object':
            case 'flag':
                if (value === true) gameArgs.push(`-${key}`);
                break;
            case 'string':
                if (typeof value === 'string' && value.trim() !== '') {
                    gameArgs.push(`-${key}=${value.trim()}`);
                }
                break;
        }
    }
  }

  try {
    const child = spawn(GAME_EXE_PATH, gameArgs, {
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

// --- BACKUP & RESTORE ---

// Helper: Get folder size
async function getFolderSize(folderPath) {
  let totalSize = 0;
  let fileCount = 0;
  try {
    if (!fs.existsSync(folderPath)) {
      return { totalSize: 0, fileCount: 0, mtime: null };
    }
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        const subFolderInfo = await getFolderSize(fullPath);
        totalSize += subFolderInfo.totalSize;
        fileCount += subFolderInfo.fileCount;
      } else {
        const stats = await fs.promises.stat(fullPath);
        totalSize += stats.size;
        fileCount++;
      }
    }
    const folderStat = await fs.promises.stat(folderPath);
    return { totalSize, fileCount, mtime: folderStat.mtime };
  } catch (e) {
    console.error(`Error getting size for ${folderPath}:`, e);
    return { totalSize: 0, fileCount: 0, mtime: null };
  }
}

// Helper: Get free disk space
function getDriveFreeSpace(drivePath) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    // On Windows, get drive letter (e.g., C:). On others, the path is fine.
    const command = isWindows 
      ? `wmic logicaldisk where "DeviceID='${path.parse(drivePath).root.substring(0, 2)}'" get FreeSpace /value`
      : `df -kP "${drivePath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) return reject(error);
      if (stderr) return reject(new Error(stderr));
      
      if (isWindows) {
        const match = stdout.match(/FreeSpace=(\d+)/);
        resolve(match ? parseInt(match[1], 10) : 0);
      } else {
        const lines = stdout.trim().split('\n');
        const parts = lines[lines.length - 1].split(/\s+/);
        const availableKB = parseInt(parts[3], 10);
        resolve(availableKB * 1024); // Convert KB to Bytes
      }
    });
  });
}

// Helper: Recursive copy with progress
async function copyFolderRecursive(source, target, progressCallback) {
  const { totalSize, fileCount } = await getFolderSize(source);
  let copiedSize = 0;
  let filesCopied = 0;

  async function copy(src, dest) {
    const entries = await fs.promises.readdir(src, { withFileTypes: true });
    await fs.promises.mkdir(dest, { recursive: true });

    for (let entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copy(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
        const stats = await fs.promises.stat(srcPath);
        copiedSize += stats.size;
        filesCopied++;
        progressCallback({ totalSize, copiedSize, fileCount, filesCopied, currentFile: entry.name });
      }
    }
  }

  await copy(source, target);
}


ipcMain.handle('backup:get-status', async () => {
  try {
    const sourceInfo = await getFolderSize(SOURCE_DATA_PATH);
    const backupInfo = await getFolderSize(BACKUP_DATA_PATH);
    const freeSpace = await getDriveFreeSpace(CWD);
    return {
      success: true,
      source: sourceInfo,
      backup: backupInfo,
      freeSpace
    };
  } catch (e) {
    console.error('Failed to get backup status:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('backup:start-backup', async () => {
  try {
    const sourceInfo = await getFolderSize(SOURCE_DATA_PATH);
    if (sourceInfo.totalSize === 0) {
      throw new Error("Source game data folder is empty or not found.");
    }

    const freeSpace = await getDriveFreeSpace(CWD);
    if (freeSpace < sourceInfo.totalSize) {
      throw new Error("Not enough free disk space for backup.");
    }
    
    // Clean existing backup
    if (fs.existsSync(BACKUP_DATA_PATH)) {
      await fs.promises.rm(BACKUP_DATA_PATH, { recursive: true, force: true });
    }
    await fs.promises.mkdir(BACKUP_DATA_PATH, { recursive: true });

    await copyFolderRecursive(SOURCE_DATA_PATH, BACKUP_DATA_PATH, (progress) => {
      mainWindow?.webContents.send('backup:progress', progress);
    });

    return { success: true };
  } catch (e) {
    console.error('Backup failed:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('backup:start-restore', async () => {
    try {
        const backupInfo = await getFolderSize(BACKUP_DATA_PATH);
        if (backupInfo.totalSize === 0) {
            throw new Error("Backup folder is empty or not found. Cannot restore.");
        }

        // Clean existing game data
        if (fs.existsSync(SOURCE_DATA_PATH)) {
            await fs.promises.rm(SOURCE_DATA_PATH, { recursive: true, force: true });
        }
        await fs.promises.mkdir(SOURCE_DATA_PATH, { recursive: true });

        await copyFolderRecursive(BACKUP_DATA_PATH, SOURCE_DATA_PATH, (progress) => {
            mainWindow?.webContents.send('backup:progress', progress);
        });

        return { success: true };
    } catch (e) {
        console.error('Restore failed:', e);
        return { success: false, error: e.message };
    }
});