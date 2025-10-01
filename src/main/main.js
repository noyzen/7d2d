


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
const shortcutIpc = require('./ipc/shortcut');

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
  shortcutIpc.init(mainWindow);
}

app.on('ready', () => {
  createWindow();
  shortcutIpc.createOrUpdateShortcutOnStartup();

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