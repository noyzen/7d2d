const { ipcMain } = require('electron');

let mainWindow;

function handleMinimize() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
}

function handleMaximize() {
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    return mainWindow.isMaximized();
  });
}

function handleClose() {
  ipcMain.handle('window:close', () => mainWindow?.close());
}

function handleIsMaximized() {
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
}

exports.init = (mw) => {
  mainWindow = mw;
  handleMinimize();
  handleMaximize();
  handleClose();
  handleIsMaximized();
};
