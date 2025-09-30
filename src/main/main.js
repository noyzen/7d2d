const { app, BrowserWindow, Menu, nativeTheme, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const WindowState = require('electron-window-state');
const { XMLParser } = require('fast-xml-parser');

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
    return { success: true };
  } catch (e) {
    console.error("Failed to save settings:", e);
    return { success: false, error: e.message };
  }
});

// Launch game
ipcMain.handle('launcher:start-game', () => {
  if (!fs.existsSync(GAME_EXE_PATH)) {
    return { error: `7DaysToDie.exe not found in the launcher directory!` };
  }
  try {
    execFile(GAME_EXE_PATH, (error) => {
      if (error) throw error;
    });
    return { success: true };
  } catch (e) {
    console.error("Failed to launch game:", e);
    return { error: e.message };
  }
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