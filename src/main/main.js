
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

  try {
    let settings = {};
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        }
    } catch (e) {
        console.warn("Could not load settings for shortcut creation. Proceeding with default behavior.", e);
    }

    if (settings.createDesktopShortcut === false) {
        console.log('Desktop shortcut creation is disabled in settings.');
        return;
    }
    
    const packageJson = require(path.join(app.getAppPath(), 'package.json'));
    const appId = packageJson.build.appId;
    const productName = packageJson.build.productName || packageJson.name;
    const description = packageJson.description;

    const shortcutPath = path.join(app.getPath('desktop'), `${productName}.lnk`);
    const targetPath = app.getPath('exe');

    const shortcutOptions = {
        target: targetPath,
        cwd: path.dirname(targetPath),
        description: description,
        icon: targetPath,
        iconIndex: 0,
        appUserModelId: appId
    };

    // Optimization: Avoid rewriting the shortcut if it already exists and is correct.
    // This prevents the icon from briefly turning white on every app start.
    try {
        const existingShortcut = shell.readShortcutLink(shortcutPath);
        if (existingShortcut.target === shortcutOptions.target &&
            existingShortcut.appUserModelId === shortcutOptions.appUserModelId &&
            existingShortcut.cwd.toLowerCase() === shortcutOptions.cwd.toLowerCase()) {
            return; // Shortcut is already correct.
        }
    } catch (e) {
        // Shortcut doesn't exist or is invalid, so we need to create/update it.
    }

    try {
        const success = shell.writeShortcutLink(shortcutPath, 'update', shortcutOptions);
        if (success) {
            console.log('Desktop shortcut created/updated successfully.');
        } else {
            console.error('Failed to create/update desktop shortcut.');
            dialog.showErrorBox(
                'Shortcut Creation Failed',
                'The application could not create a desktop shortcut. This may be due to folder permissions or security software.'
            );
        }
    } catch (e) {
        console.error('Error while creating/updating desktop shortcut:', e);
        dialog.showErrorBox(
            'Shortcut Creation Error',
            `An unexpected error occurred: ${e.message}`
        );
    }
  } catch(e) {
      console.error('A critical error occurred during shortcut creation process:', e);
      dialog.showErrorBox(
        'Shortcut Creation Error',
        `A critical error occurred: ${e.message}`
      );
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
