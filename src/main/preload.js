const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appInfo', {
  platform: process.platform,
  versions: process.versions
});

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChanged: (callback) => ipcRenderer.on('window:maximize-changed', (_e, maximized) => callback(maximized))
});

contextBridge.exposeInMainWorld('launcher', {
  getInitialData: () => ipcRenderer.invoke('launcher:get-initial-data'),
  saveSettings: (settings) => ipcRenderer.invoke('launcher:save-settings', settings),
  startGame: () => ipcRenderer.invoke('launcher:start-game'),
  getMods: () => ipcRenderer.invoke('launcher:get-mods'),
  toggleMod: (args) => ipcRenderer.invoke('launcher:toggle-mod', args),
});
