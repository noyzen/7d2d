const { app, BrowserWindow, Menu, globalShortcut, shell } = require('electron');
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
  // This feature is for Windows packaged apps
  if (process.platform !== 'win32' || !app.isPackaged) {
      return;
  }

  let settings = {};
  try {
      if (fs.existsSync(SETTINGS_PATH)) {
          settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      }
  } catch (e) {
      console.error("Failed to load settings for shortcut creation:", e);
      return;
  }

  // Default to true if setting is not present
  if (settings.createDesktopShortcut === false) {
      console.log('Desktop shortcut creation is disabled in settings.');
      return;
  }

  const shortcutPath = path.join(app.getPath('desktop'), '7D2D Launcher.lnk');
  const targetPath = app.getPath('exe');

  const options = {
      target: targetPath,
      cwd: path.dirname(targetPath),
      description: 'A feature-rich game launcher for 7 Days to Die.',
      icon: path.join(CWD, 'appicon.png'),
      iconIndex: 0,
  };

  try {
      // Using 'update' will create or modify the shortcut. This is useful if the user moves the portable app.
      const success = shell.writeShortcutLink(shortcutPath, 'update', options);
      if (success) {
          console.log('Desktop shortcut created/updated successfully.');
      } else {
          console.error('Failed to create/update desktop shortcut.');
      }
  } catch (e) {
      console.error('Error while creating/updating desktop shortcut:', e);
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