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
  startGame: (settings) => ipcRenderer.invoke('launcher:start-game', settings),
  selectFile: () => ipcRenderer.invoke('launcher:select-file'),
  getFirewallStatus: () => ipcRenderer.invoke('launcher:get-firewall-status'),
  getGamePath: () => ipcRenderer.invoke('launcher:get-game-path'),
  relaunchAsAdmin: () => ipcRenderer.invoke('launcher:relaunch-as-admin'),
  onGameClosed: (callback) => ipcRenderer.on('game:closed', () => callback()),
});

contextBridge.exposeInMainWorld('mods', {
    get: () => ipcRenderer.invoke('mods:get'),
    toggle: (args) => ipcRenderer.invoke('mods:toggle', args),
    applyModSet: (args) => ipcRenderer.invoke('mods:apply-mod-set', args),
});

contextBridge.exposeInMainWorld('lan', {
  startDiscovery: () => ipcRenderer.invoke('lan:start-discovery'),
  stopDiscovery: () => ipcRenderer.invoke('lan:stop-discovery'),
  sendMessage: (message) => ipcRenderer.invoke('lan:send-message', message),
  setUsername: (username) => ipcRenderer.invoke('lan:set-username', username),
  onPeerUpdate: (callback) => ipcRenderer.on('lan:peer-update', (_e, peers) => callback(peers)),
  onMessageReceived: (callback) => ipcRenderer.on('lan:message-received', (_e, message) => callback(message)),
  getChatHistory: () => ipcRenderer.invoke('lan:get-chat-history'),
  clearChatHistory: () => ipcRenderer.invoke('lan:clear-chat-history'),
});

contextBridge.exposeInMainWorld('backup', {
  getStatus: () => ipcRenderer.invoke('backup:get-status'),
  startBackup: () => ipcRenderer.invoke('backup:start-backup'),
  startRestore: () => ipcRenderer.invoke('backup:start-restore'),
  startRegistryBackup: () => ipcRenderer.invoke('backup:start-registry-backup'),
  startRegistryRestore: () => ipcRenderer.invoke('backup:start-registry-restore'),
  onProgress: (callback) => ipcRenderer.on('backup:progress', (_e, progress) => callback(progress)),
});

contextBridge.exposeInMainWorld('transfer', {
    toggleSharing: (enable) => ipcRenderer.invoke('transfer:toggle-sharing', enable),
    downloadGame: (args) => ipcRenderer.invoke('transfer:download-game', args),
    cancelDownload: () => ipcRenderer.invoke('transfer:cancel-download'),
    onProgress: (callback) => ipcRenderer.on('transfer:progress', (_e, progress) => callback(progress)),
    onComplete: (callback) => ipcRenderer.on('transfer:complete', (_e, result) => callback(result)),
    onActiveDownloadsUpdate: (callback) => ipcRenderer.on('transfer:active-downloads-update', (_e, downloaders) => callback(downloaders)),
});

contextBridge.exposeInMainWorld('shortcut', {
    create: () => ipcRenderer.invoke('shortcut:create'),
    delete: () => ipcRenderer.invoke('shortcut:delete'),
    exists: () => ipcRenderer.invoke('shortcut:exists'),
});
