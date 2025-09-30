

const { app, BrowserWindow, Menu, globalShortcut, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const WindowState = require('electron-window-state');
const { CWD, SETTINGS_PATH } = require('./constants');
const windowIpc = require('./ipc/window');
const launcherIpc = require('./ipc/launcher');
const modsIpc = require('./ipc/mods');
const backupIpc = require('./ipc/backup');
const lanIpc = require('./ipc/lan');
const transferIpc = require('./ipc/transfer');

let mainWindow;

// The appId must match the one in package.json build config.
// This is used for desktop shortcuts and Windows notifications.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.noyzen.7d2dlauncher');
}

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

function createDesktopShortcut() {
  if (process.platform !== 'win32' || !app.isPackaged) return;

  try {
    let settings = {};
    if (fs.existsSync(SETTINGS_PATH)) {
      try {
        settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      } catch (e) {
        console.warn("Could not load settings for shortcut creation.", e);
      }
    }

    if (settings.createDesktopShortcut === false) {
      console.log('Desktop shortcut creation is disabled in settings.');
      return;
    }

    const packageJson = require(path.join(app.getAppPath(), 'package.json'));
    const appId = 'com.noyzen.7d2dlauncher';
    const productName = app.name;
    const shortcutPath = path.join(app.getPath('desktop'), `${productName}.lnk`);

    // Use CWD which correctly resolves the path for portable apps, unlike
    // app.getPath('exe') which may point to a temporary directory during first run.
    const exeName = path.basename(app.getPath('exe'));
    const targetPath = path.join(CWD, exeName);

    const shortcutOptions = {
      target: targetPath,
      cwd: CWD,
      description: packageJson.description,
      icon: targetPath,
      iconIndex: 0,
      appUserModelId: appId
    };

    let needsAction = false;
    let operation = 'create';

    if (fs.existsSync(shortcutPath)) {
      operation = 'update';
      try {
        const existingShortcut = shell.readShortcutLink(shortcutPath);
        if (existingShortcut.target !== shortcutOptions.target ||
            existingShortcut.appUserModelId !== shortcutOptions.appUserModelId ||
            existingShortcut.cwd?.toLowerCase() !== shortcutOptions.cwd.toLowerCase() ||
            existingShortcut.description !== shortcutOptions.description ||
            existingShortcut.icon !== shortcutOptions.icon) {
          needsAction = true;
        }
      } catch (e) {
        console.warn('Could not read existing shortcut, will attempt to replace it.', e);
        operation = 'replace';
        needsAction = true;
      }
    } else {
      needsAction = true; // Shortcut does not exist, so we need to create it.
    }

    if (!needsAction) {
      return; // Shortcut exists and is already correct.
    }

    try {
      // The second argument is the operation. It must be 'create' for new shortcuts.
      const success = shell.writeShortcutLink(shortcutPath, operation, shortcutOptions);
      if (success) {
        console.log(`Desktop shortcut successfully ${operation}d.`);
      } else {
        console.warn(`shell.writeShortcutLink returned false for operation '${operation}'. This may be due to security software.`);
      }
    } catch (e) {
      console.error(`An error occurred during shortcut operation '${operation}':`, e);
    }
  } catch (e) {
    console.error('A critical error occurred during the shortcut creation process:', e);
  }
}

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
    icon: path.join(CWD, 'appicon.png'),
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

  // Initialize IPC handlers
  windowIpc.init(mainWindow);
  launcherIpc.init(mainWindow);
  modsIpc.init(mainWindow);
  backupIpc.init(mainWindow);
  lanIpc.init(mainWindow);
  transferIpc.init(mainWindow);
}

app.on('ready', () => {
  createWindow();
  createDesktopShortcut();

  globalShortcut.register('Control+Shift+I', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });
});

app.on('will-quit', () => {
  lanIpc.shutdown();
  transferIpc.shutdown();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});