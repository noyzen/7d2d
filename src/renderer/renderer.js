// --- STATE ---
let settings = {
  playMusic: true,
  exitOnLaunch: false,
  playerName: 'Survivor',
  configEditorRules: [],
  registryEditorRules: [],
  launchParameters: {},
  aboutPage: {
    title: 'About This Launcher',
    creator: 'Your Name Here',
    version: '1.0.0',
    website: 'https://example.com',
    description: 'This is a custom launcher for 7 Days to Die, designed to provide a better user experience for managing mods, settings, and launching the game. Thank you for using it!'
  }
};
let lanChatStarted = false;
let selfId = null;
let unreadMessageCount = 0;
let logoClickCount = 0;
let logoClickTimer = null;
let isBackupOperationInProgress = false;

// --- LAUNCH PARAMETERS CONFIG ---
const LAUNCH_PARAMETERS_CONFIG = {
    // booleans
    'AllowCrossplay': { type: 'bool', description: 'Allow crossplay between platforms.' },
    'AllowJoinConfigModded': { type: 'bool', description: 'Allow joining modded servers.' },
    'LoadSaveGame': { type: 'bool', description: 'Load a specific save game on start.' },
    'LocalizationChecks': { type: 'bool', description: 'Enable localization checks.' },
    'NoXInput': { type: 'bool', description: 'Disable XInput support.' },
    'PlayerPrefsFile': { type: 'bool', description: 'Use a specific player preferences file.' },
    'SkipNewsScreen': { type: 'bool', description: 'Skip the news screen on startup.' },
    // objects (flags)
    'DebugNet': { type: 'object', description: 'Enable network debugging.' },
    'DebugPackages': { type: 'object', description: 'Enable package debugging.' },
    'DisableNativeInput': { type: 'object', description: 'Disable native input handling.' },
    'ExportCustomAtlases': { type: 'object', description: 'Export custom atlases.' },
    'NoEAC': { type: 'object', description: 'Disable Easy Anti-Cheat.' },
    'NoGameSense': { type: 'object', description: 'Disable SteelSeries GameSense.' },
    'NoLiteNetLib': { type: 'object', description: 'Disable LiteNetLib networking.' },
    'NoRakNet': { type: 'object', description: 'Disable RakNet networking.' },
    'NoUNet': { type: 'object', description: 'Disable UNet networking.' },
    'Quick-Continue': { type: 'object', description: 'Quickly continue the last game.' },
    'SkipIntro': { type: 'object', description: 'Skip the intro video.' },
    'Submission': { type: 'object', description: 'Enable submission mode (no value).' },
    'dedicated': { type: 'flag', description: 'Run in dedicated server mode.' },
    // strings & ints
    'CrossPlatform': { type: 'string', description: 'Specify cross-platform service.' },
    'DebugAchievements': { type: 'string', description: 'Debug achievements (e.g., verbose).' },
    'DebugEAC': { type: 'string', description: 'Debug EAC (e.g., verbose).' },
    'DebugEOS': { type: 'string', description: 'Debug EOS (e.g., verbose).' },
    'DebugInput': { type: 'string', description: 'Debug input (e.g., verbose).' },
    'DebugSessions': { type: 'string', description: 'Debug sessions (e.g., verbose).' },
    'DebugShapes': { type: 'string', description: 'Debug shapes (e.g., verbose).' },
    'DebugXui': { type: 'string', description: 'Debug XUI (e.g., verbose).' },
    'Language': { type: 'string', description: 'Set the game language (e.g., "english").' },
    'LogFile': { type: 'string', description: 'Specify a custom log file name.' },
    'MapChunkDatabase': { type: 'string', description: 'Set map chunk database type.' },
    'MaxWorldSizeClient': { type: 'int', description: 'Max world size for clients.' },
    'MaxWorldSizeHost': { type: 'int', description: 'Max world size for hosts.' },
    'NewPrefabsMod': { type: 'string', description: 'Load prefabs from a specific mod.' },
    'Platform': { type: 'string', description: 'Force a specific platform.' },
    'ServerPlatforms': { type: 'string', description: 'Allowed server platforms.' },
    'SessionInvite': { type: 'string', description: 'Accept a session invite.' },
    'UserDataFolder': { type: 'string', description: 'Specify a custom user data folder.' },
};


// --- DOM ELEMENTS ---
// Window Controls
const minBtn = document.getElementById('min-btn');
const maxBtn = document.getElementById('max-btn');
const maxIcon = document.getElementById('max-icon');
const closeBtn = document.getElementById('close-btn');

// App
const bgm = document.getElementById('bgm');
const errorOverlay = document.getElementById('error-overlay');
const errorMessage = document.getElementById('error-message');

// Navigation
const sidebarLogo = document.getElementById('sidebar-logo');
const navButtons = document.querySelectorAll('.nav-button');
const pages = document.querySelectorAll('.page');
const developerNavBtn = document.getElementById('developer-nav-btn');

// Home Page
const startGameBtn = document.getElementById('start-game-btn');
const startGameError = document.getElementById('start-game-error');
const playerNameWrapper = document.getElementById('player-name-wrapper');
const playerNameDisplay = document.getElementById('player-name-display');
const playerNameInput = document.getElementById('player-name-input');
const editPlayerNameBtn = document.getElementById('edit-player-name-btn');
const homeLanStatus = document.getElementById('home-lan-status');
const lanPlayerCount = document.getElementById('lan-player-count');
const homePlayerList = document.getElementById('home-player-list');
const goToChatBtn = document.getElementById('go-to-chat-btn');
const activeModsCount = document.getElementById('active-mods-count');


// Mods Page
const enabledModsList = document.getElementById('enabled-mods-list');
const disabledModsList = document.getElementById('disabled-mods-list');

// Settings Page
const musicToggle = document.getElementById('setting-music-toggle');
const exitOnLaunchToggle = document.getElementById('setting-exit-toggle');

// Backup/Restore Elements
const backupStatusContainer = document.getElementById('backup-status-container');
const backupControls = document.getElementById('backup-controls');
const backupBtn = document.getElementById('backup-btn');
const restoreBtn = document.getElementById('restore-btn');
const backupProgressContainer = document.getElementById('backup-progress-container');
const progressLabel = document.getElementById('progress-label');
const progressPercentage = document.getElementById('progress-percentage');
const progressBarInner = document.getElementById('progress-bar-inner');
const progressDetails = document.getElementById('progress-details');
const backupResultMessage = document.getElementById('backup-result-message');
const registryBackupWrapper = document.getElementById('registry-backup-wrapper');
const backupRegistryBtn = document.getElementById('backup-registry-btn');
const restoreRegistryBtn = document.getElementById('restore-registry-btn');


// Developer Page
const configRulesList = document.getElementById('config-rules-list');
const addConfigRuleBtn = document.getElementById('add-config-rule-btn');
const registryEditorWrapper = document.getElementById('registry-editor-wrapper');
const registryRulesList = document.getElementById('registry-rules-list');
const addRegistryRuleBtn = document.getElementById('add-registry-rule-btn');
const aboutEditorTitle = document.getElementById('about-editor-title');
const aboutEditorCreator = document.getElementById('about-editor-creator');
const aboutEditorWebsite = document.getElementById('about-editor-website');
const aboutEditorDescription = document.getElementById('about-editor-description');
const launchParamsContainer = document.getElementById('launch-params-container');


// Chat Page
const chatPage = document.getElementById('page-chat');
const playerList = document.getElementById('player-list');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatNotificationBadge = document.getElementById('chat-notification-badge');

// About Page
const aboutTitle = document.getElementById('about-title');
const aboutDescription = document.getElementById('about-description');
const aboutCreator = document.getElementById('about-creator');
const aboutVersion = document.getElementById('about-version');
const aboutWebsite = document.getElementById('about-website');


// --- WINDOW CONTROLS ---
async function refreshMaxButton() {
  try {
    const maximized = await window.windowControls.isMaximized();
    document.body.classList.toggle('maximized', maximized);
    maxIcon.classList.toggle('fa-window-maximize', !maximized);
    maxIcon.classList.toggle('fa-window-restore', maximized);
    const text = maximized ? 'Restore' : 'Maximize';
    maxBtn.title = text;
    maxBtn.setAttribute('aria-label', text);
  } catch (e) {
    console.error('Failed to refresh max button state:', e);
  }
}

minBtn?.addEventListener('click', () => window.windowControls.minimize());
maxBtn?.addEventListener('click', () => window.windowControls.maximize());
closeBtn?.addEventListener('click', () => window.windowControls.close());
window.windowControls.onMaximizeChanged(refreshMaxButton);


// --- LAUNCHER LOGIC ---

// Developer Mode Unlock
sidebarLogo.addEventListener('click', () => {
    logoClickCount++;
    clearTimeout(logoClickTimer);
    logoClickTimer = setTimeout(() => {
        logoClickCount = 0; // Reset after 2 seconds of inactivity
    }, 2000);

    if (logoClickCount === 7) {
        developerNavBtn.style.display = 'flex';
        logoClickCount = 0;
        clearTimeout(logoClickTimer);
    }
});

// Navigation
navButtons.forEach(button => {
  button.addEventListener('click', () => {
    const pageId = button.dataset.page;

    pages.forEach(page => page.classList.toggle('active', page.id === pageId));
    navButtons.forEach(btn => btn.classList.toggle('active', btn === button));
    
    if (pageId === 'page-mods') {
      loadMods();
    } else if (pageId === 'page-developer') {
      renderConfigEditorRules();
      renderRegistryRules();
      renderAboutPageEditor();
      renderLaunchParameters();
    } else if (pageId === 'page-chat') {
      // Clear notifications when entering chat
      unreadMessageCount = 0;
      updateUnreadBadge();
      // Scroll to the latest message
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } else if (pageId === 'page-settings') {
      renderBackupStatus();
    }
  });
});

// Helper to control player name visibility
function updatePlayerNameVisibility() {
    const hasConfigRules = settings.configEditorRules && settings.configEditorRules.length > 0;
    const hasRegistryRules = settings.registryEditorRules && settings.registryEditorRules.length > 0;

    if (hasConfigRules || hasRegistryRules) {
        playerNameWrapper.style.display = 'flex';
    } else {
        playerNameWrapper.style.display = 'none';
    }
}

// Settings
function applySettings() {
  musicToggle.checked = settings.playMusic ?? true;
  exitOnLaunchToggle.checked = settings.exitOnLaunch ?? false;
  
  const playerName = settings.playerName || 'Survivor';
  playerNameDisplay.textContent = playerName;
  playerNameInput.value = playerName;

  if (settings.playMusic) {
    bgm.play().catch(e => console.error("Audio playback failed:", e));
  } else {
    bgm.pause();
  }
}

function saveSettings() {
  window.launcher.saveSettings(settings);
}

musicToggle.addEventListener('change', () => {
  settings.playMusic = musicToggle.checked;
  applySettings();
  saveSettings();
});

exitOnLaunchToggle.addEventListener('change', () => {
  settings.exitOnLaunch = exitOnLaunchToggle.checked;
  saveSettings();
});

// Player Name Editing
function saveAndExitEditMode() {
    // Trim and use a fallback name if empty
    const newName = playerNameInput.value.trim() || 'Survivor';

    if (newName !== settings.playerName) {
        settings.playerName = newName;
    }
    
    saveSettings(); // This saves to file and informs the main process which will broadcast the name change.

    // Update UI elements with potentially corrected name
    playerNameDisplay.textContent = settings.playerName;
    playerNameInput.value = settings.playerName;

    // Switch back to display mode
    playerNameInput.classList.add('hidden');
    playerNameDisplay.classList.remove('hidden');
    editPlayerNameBtn.classList.remove('hidden');
}

editPlayerNameBtn.addEventListener('click', () => {
    playerNameDisplay.classList.add('hidden');
    editPlayerNameBtn.classList.add('hidden');
    playerNameInput.classList.remove('hidden');
    playerNameInput.focus();
    playerNameInput.select();
});

playerNameInput.addEventListener('blur', saveAndExitEditMode);
playerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        saveAndExitEditMode();
    } else if (e.key === 'Escape') {
        // Revert changes and exit
        playerNameInput.value = settings.playerName;
        saveAndExitEditMode(); // This will just exit without saving new value
    }
});


// Home Page
async function updateHomePageStats() {
    try {
        const { enabled } = await window.launcher.getMods();
        activeModsCount.textContent = enabled.length;
    } catch (e) {
        console.error("Failed to update home page stats:", e);
        activeModsCount.textContent = 'N/A';
    }
}

startGameBtn.addEventListener('click', async () => {
  startGameBtn.disabled = true;
  startGameBtn.querySelector('span').textContent = 'LAUNCHING...';
  startGameError.textContent = '';
  
  if (settings.playMusic) {
    bgm.muted = true;
  }

  const result = await window.launcher.startGame(settings);
  if (result.error) {
    startGameError.textContent = result.error;
    startGameBtn.disabled = false;
    startGameBtn.querySelector('span').textContent = 'START GAME';
    if (settings.playMusic) {
      bgm.muted = false;
    }
  } else if (result.action === 'quitting') {
    startGameBtn.querySelector('span').textContent = 'EXITING...';
  }
  // If minimized, button stays disabled until game closes
});

window.launcher.onGameClosed(() => {
  if (settings.playMusic) {
      bgm.muted = false;
  }
  startGameBtn.disabled = false;
  startGameBtn.querySelector('span').textContent = 'START GAME';
});

goToChatBtn.addEventListener('click', () => {
  // Find the chat button and click it to navigate
  document.querySelector('.nav-button[data-page="page-chat"]').click();
});


// Mods Page
function createModElement(mod, isEnabled) {
  const modEl = document.createElement('div');
  modEl.className = 'mod-card';
  modEl.innerHTML = `
    <div class="mod-info">
      <h3>${mod.name} <span class="mod-version">${mod.version}</span></h3>
      <p class="mod-author">by ${mod.author}</p>
      <p class="mod-desc">${mod.description}</p>
    </div>
    <div class="mod-control">
      <label class="switch">
        <input type="checkbox" ${isEnabled ? 'checked' : ''} data-foldername="${mod.folderName}">
        <span class="slider"></span>
      </label>
    </div>
  `;
  modEl.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
    await window.launcher.toggleMod({ folderName: mod.folderName, enable: e.target.checked });
    loadMods();
    updateHomePageStats();
  });
  return modEl;
}

async function loadMods() {
    enabledModsList.innerHTML = '<div class="loading-spinner"></div>';
    disabledModsList.innerHTML = '<div class="loading-spinner"></div>';

    const { enabled, disabled } = await window.launcher.getMods();
    
    enabledModsList.innerHTML = '';
    disabledModsList.innerHTML = '';

    if (enabled.length > 0) {
      enabled.forEach(mod => enabledModsList.appendChild(createModElement(mod, true)));
    } else {
      enabledModsList.innerHTML = '<p class="no-mods">No enabled mods found.</p>';
    }

    if (disabled.length > 0) {
      disabled.forEach(mod => disabledModsList.appendChild(createModElement(mod, false)));
    } else {
      disabledModsList.innerHTML = '<p class="no-mods">No disabled mods found.</p>';
    }
}

// About Page
function renderAboutPage() {
    const aboutData = settings.aboutPage;
    aboutTitle.textContent = aboutData.title;
    aboutDescription.textContent = aboutData.description;
    aboutCreator.textContent = aboutData.creator;
    aboutVersion.textContent = aboutData.version;
    aboutWebsite.textContent = aboutData.website;
    aboutWebsite.href = aboutData.website;
}

// --- Backup & Restore ---
function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function renderBackupStatus() {
    const status = await window.backup.getStatus();
    if (!status.success) {
        backupStatusContainer.innerHTML = `<p class="error-message">Could not get backup status: ${status.error}</p>`;
        return;
    }

    const { source, backup, freeSpace, registryBackupExists } = status;
    const sourceDate = source.mtime ? new Date(source.mtime).toLocaleString() : 'N/A';
    const backupDate = backup.mtime ? new Date(backup.mtime).toLocaleString() : 'N/A';

    backupStatusContainer.innerHTML = `
        <div class="backup-info-grid">
            <div class="backup-info-item">
                <span>Current Data Size</span>
                <p>${formatBytes(source.totalSize)}</p>
            </div>
            <div class="backup-info-item">
                <span>Last Backup Size</span>
                <p>${formatBytes(backup.totalSize)}</p>
            </div>
            <div class="backup-info-item">
                <span>Last Backup Date</span>
                <p>${backupDate}</p>
            </div>
             <div class="backup-info-item">
                <span>Available Space</span>
                <p>${formatBytes(freeSpace)}</p>
            </div>
        </div>
    `;

    restoreBtn.disabled = backup.totalSize === 0;
    backupBtn.disabled = source.totalSize === 0;
    
    if (window.appInfo.platform === 'win32') {
        restoreRegistryBtn.disabled = !registryBackupExists;
    }
}

function showOperationResult(message, isError = false) {
    backupResultMessage.textContent = message;
    backupResultMessage.className = `backup-result-message ${isError ? 'error' : 'success'}`;
    setTimeout(() => {
        backupResultMessage.className = 'backup-result-message';
    }, 5000);
}

backupBtn.addEventListener('click', async () => {
    if (isBackupOperationInProgress) return;
    if (confirm('This will overwrite any existing backup. Are you sure you want to continue?')) {
        isBackupOperationInProgress = true;
        backupControls.classList.add('hidden');
        backupProgressContainer.classList.remove('hidden');
        progressLabel.textContent = 'Backing up files...';
        showOperationResult('');

        const result = await window.backup.startBackup();
        
        isBackupOperationInProgress = false;
        backupControls.classList.remove('hidden');
        backupProgressContainer.classList.add('hidden');

        if (result.success) {
            showOperationResult('File backup completed successfully!', false);
        } else {
            showOperationResult(`File backup failed: ${result.error}`, true);
        }
        renderBackupStatus();
    }
});

restoreBtn.addEventListener('click', async () => {
    if (isBackupOperationInProgress) return;
    if (confirm('DANGER: This will delete your current game data and replace it with the backup. This cannot be undone. Are you sure?')) {
        isBackupOperationInProgress = true;
        backupControls.classList.add('hidden');
        backupProgressContainer.classList.remove('hidden');
        progressLabel.textContent = 'Restoring files...';
        showOperationResult('');
        
        const result = await window.backup.startRestore();

        isBackupOperationInProgress = false;
        backupControls.classList.remove('hidden');
        backupProgressContainer.classList.add('hidden');

        if (result.success) {
            showOperationResult('File restore completed successfully!', false);
        } else {
            showOperationResult(`File restore failed: ${result.error}`, true);
        }
        renderBackupStatus();
    }
});

backupRegistryBtn.addEventListener('click', async () => {
    if (isBackupOperationInProgress) return;
    if (confirm('This will overwrite any existing registry backup. Are you sure?')) {
        showOperationResult('Backing up registry...');
        const result = await window.backup.startRegistryBackup();
        if (result.success) {
            showOperationResult('Registry backup successful!', false);
        } else {
            showOperationResult(`Registry backup failed: ${result.error}`, true);
        }
        renderBackupStatus();
    }
});

restoreRegistryBtn.addEventListener('click', async () => {
    if (isBackupOperationInProgress) return;
    if (confirm('DANGER: This will overwrite your current registry settings for the game with the backup. This can cause issues if not done correctly. Are you sure?')) {
        showOperationResult('Restoring registry...');
        const result = await window.backup.startRegistryRestore();
        if (result.success) {
            showOperationResult('Registry restore successful!', false);
        } else {
            showOperationResult(`Registry restore failed: ${result.error}`, true);
        }
        renderBackupStatus();
    }
});


window.backup.onProgress((progress) => {
    const { totalSize, copiedSize, fileCount, filesCopied, currentFile } = progress;
    const percent = totalSize > 0 ? Math.round((copiedSize / totalSize) * 100) : 0;
    
    progressBarInner.style.width = `${percent}%`;
    progressPercentage.textContent = `${percent}%`;
    progressDetails.textContent = `(${filesCopied}/${fileCount}) Copying: ${currentFile}`;
});

// --- LAN CHAT ---
function updateUnreadBadge() {
  if (unreadMessageCount > 0) {
    chatNotificationBadge.textContent = unreadMessageCount > 9 ? '9+' : unreadMessageCount;
    chatNotificationBadge.style.display = 'block';
  } else {
    chatNotificationBadge.style.display = 'none';
  }
}

function renderHomePageLanStatus(peers) {
  const onlinePeers = peers.filter(p => p.status === 'online');
  // Show if there are other players besides self
  if (onlinePeers.length > 1) { 
    homeLanStatus.classList.remove('hidden');
    lanPlayerCount.textContent = onlinePeers.length;
    homePlayerList.innerHTML = '';
    onlinePeers
      .sort((a,b) => a.name.localeCompare(b.name))
      .forEach(peer => {
        const peerEl = document.createElement('span');
        peerEl.className = 'home-player-name';
        peerEl.textContent = peer.name;
        if (peer.id === selfId) {
          peerEl.classList.add('is-self');
          peerEl.textContent += ' (You)';
        }
        homePlayerList.appendChild(peerEl);
    });
  } else {
    homeLanStatus.classList.add('hidden');
  }
}

function renderPlayerList(peers) {
  playerList.innerHTML = '';
  if (!peers || peers.length === 0) {
    playerList.innerHTML = '<p class="no-mods">No other players found.</p>';
    return;
  }
  
  // Sort: self first, then online alphabetically, then offline alphabetically
  peers.sort((a, b) => {
    if (a.id === selfId) return -1;
    if (b.id === selfId) return 1;
    if (a.status !== b.status) {
      return a.status === 'online' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  peers.forEach(peer => {
    const playerEl = document.createElement('div');
    playerEl.className = 'player-item';
    if (peer.id === selfId) {
      playerEl.classList.add('is-self');
    }
    playerEl.innerHTML = `
      <div class="status-dot ${peer.status}"></div>
      <div class="player-name-container">
        <span class="player-name" title="${peer.name}">${peer.name} ${peer.id === selfId ? '(You)' : ''}</span>
        <span class="player-os-name">${peer.osUsername || ''}</span>
      </div>
    `;
    playerList.appendChild(playerEl);
  });
}

function appendChatMessage(message) {
  const isSelf = message.id === selfId;
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';
  if (isSelf) {
    messageEl.classList.add('is-self');
  }

  const timestamp = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Sanitize text content before inserting
  const sanitizedText = message.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  messageEl.innerHTML = `
    <div class="message-header">
      <span class="message-sender">${message.name} <span class="message-os-sender">(${message.osUsername || '...'})</span></span>
      <span class="message-timestamp">${timestamp}</span>
    </div>
    <div class="message-bubble">${sanitizedText}</div>
  `;

  const shouldScroll = chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 10;

  chatMessages.appendChild(messageEl);

  if (shouldScroll) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (message) {
    window.lan.sendMessage(message);
    chatInput.value = '';
  }
});

window.lan.onPeerUpdate((data) => {
  selfId = data.selfId;
  renderPlayerList(data.list);
  renderHomePageLanStatus(data.list);
});

window.lan.onMessageReceived((message) => {
  appendChatMessage(message);
  // Don't count self messages as unread and only increment if not on chat page
  if (message.id !== selfId && !chatPage.classList.contains('active')) {
    unreadMessageCount++;
    updateUnreadBadge();
  }
});


// Config Editor
function createConfigRuleElement(rule) {
    const ruleEl = document.createElement('div');
    ruleEl.className = 'config-rule-card';
    ruleEl.dataset.id = rule.id;

    ruleEl.innerHTML = `
        <div class="config-rule-header">
            <h3>Rule #${String(rule.id).slice(-4)}</h3>
            <button class="remove-rule-btn" title="Remove Rule"><i class="fa-solid fa-trash-can"></i></button>
        </div>
        <div class="config-rule-body">
            <div class="config-field">
                <label for="file-path-${rule.id}">File Path</label>
                <div class="config-field-row">
                    <input type="text" id="file-path-${rule.id}" value="${rule.filePath || ''}" placeholder="Select a file..." readonly>
                    <button class="browse-btn">Browse</button>
                </div>
            </div>
            <div class="config-field">
                <label for="line-num-${rule.id}">Line Number</label>
                <input type="number" id="line-num-${rule.id}" value="${rule.lineNumber || ''}" min="1" placeholder="e.g., 5">
            </div>
            <div class="config-field">
                <label for="line-match-${rule.id}">Line Content Match (optional)</label>
                <input type="text" id="line-match-${rule.id}" value="${rule.lineMatch || ''}" placeholder="Text that must exist on the line for it to be replaced, e.g., UserName=">
            </div>
            <div class="config-field">
                <label for="line-template-${rule.id}">New Line Content (use ##7d2dlauncher-username##)</label>
                <input type="text" id="line-template-${rule.id}" value="${rule.lineTemplate || ''}" placeholder="e.g., UserName=##7d2dlauncher-username##">
            </div>
        </div>
    `;

    // Event Listeners
    const filePathInput = ruleEl.querySelector(`#file-path-${rule.id}`);
    const lineNumInput = ruleEl.querySelector(`#line-num-${rule.id}`);
    const lineMatchInput = ruleEl.querySelector(`#line-match-${rule.id}`);
    const lineTemplateInput = ruleEl.querySelector(`#line-template-${rule.id}`);
    const browseBtn = ruleEl.querySelector('.browse-btn');
    const removeBtn = ruleEl.querySelector('.remove-rule-btn');

    const updateRule = () => {
        const ruleIndex = settings.configEditorRules.findIndex(r => r.id === rule.id);
        if (ruleIndex > -1) {
            const lineNum = parseInt(lineNumInput.value, 10);
            settings.configEditorRules[ruleIndex] = {
                ...settings.configEditorRules[ruleIndex],
                filePath: filePathInput.value,
                lineNumber: isNaN(lineNum) ? null : lineNum,
                lineMatch: lineMatchInput.value,
                lineTemplate: lineTemplateInput.value,
            };
            saveSettings();
        }
    };
    
    browseBtn.addEventListener('click', async () => {
        const result = await window.launcher.selectFile();
        if (result.success) {
            filePathInput.value = result.filePath;
            updateRule();
        }
    });

    lineNumInput.addEventListener('change', updateRule);
    lineMatchInput.addEventListener('change', updateRule);
    lineTemplateInput.addEventListener('change', updateRule);

    removeBtn.addEventListener('click', () => {
        settings.configEditorRules = settings.configEditorRules.filter(r => r.id !== rule.id);
        saveSettings();
        renderConfigEditorRules();
        updatePlayerNameVisibility();
    });

    return ruleEl;
}

function renderConfigEditorRules() {
    configRulesList.innerHTML = '';
    if (settings.configEditorRules && settings.configEditorRules.length > 0) {
        settings.configEditorRules.forEach(rule => {
            configRulesList.appendChild(createConfigRuleElement(rule));
        });
    } else {
        configRulesList.innerHTML = '<p class="no-mods">No configuration rules added yet.</p>';
    }
}

addConfigRuleBtn.addEventListener('click', () => {
    const newRule = {
        id: Date.now(),
        filePath: '',
        lineNumber: null,
        lineTemplate: '',
        lineMatch: '',
    };
    if (!settings.configEditorRules) {
      settings.configEditorRules = [];
    }
    settings.configEditorRules.push(newRule);
    saveSettings();
    renderConfigEditorRules();
    updatePlayerNameVisibility();
});

// Registry Editor
function createRegistryRuleElement(rule) {
    const ruleEl = document.createElement('div');
    ruleEl.className = 'registry-rule-card';
    ruleEl.dataset.id = rule.id;

    ruleEl.innerHTML = `
        <div class="registry-rule-header">
            <h3>Registry Rule #${String(rule.id).slice(-4)}</h3>
            <button class="remove-rule-btn" title="Remove Rule"><i class="fa-solid fa-trash-can"></i></button>
        </div>
        <div class="registry-rule-body">
            <div class="config-field">
                <label for="reg-path-${rule.id}">Registry Path</label>
                <input type="text" id="reg-path-${rule.id}" value="${rule.regPath || ''}" placeholder="e.g., HKEY_CURRENT_USER\\Software\\MyGame">
            </div>
            <div class="config-field">
                <label for="key-name-${rule.id}">Key Name</label>
                <input type="text" id="key-name-${rule.id}" value="${rule.keyName || ''}" placeholder="e.g., PlayerName_h12345">
            </div>
            <div class="config-field">
                <label for="key-value-${rule.id}">Key Value Template (use ##7d2dlauncher-username##)</label>
                <input type="text" id="key-value-${rule.id}" value="${rule.keyValueTemplate || ''}" placeholder="e.g., ##7d2dlauncher-username##">
            </div>
        </div>
    `;

    // Event Listeners
    const regPathInput = ruleEl.querySelector(`#reg-path-${rule.id}`);
    const keyNameInput = ruleEl.querySelector(`#key-name-${rule.id}`);
    const keyValueInput = ruleEl.querySelector(`#key-value-${rule.id}`);
    const removeBtn = ruleEl.querySelector('.remove-rule-btn');

    const updateRule = () => {
        const ruleIndex = settings.registryEditorRules.findIndex(r => r.id === rule.id);
        if (ruleIndex > -1) {
            settings.registryEditorRules[ruleIndex] = {
                ...settings.registryEditorRules[ruleIndex],
                regPath: regPathInput.value,
                keyName: keyNameInput.value,
                keyValueTemplate: keyValueInput.value,
            };
            saveSettings();
        }
    };
    
    regPathInput.addEventListener('change', updateRule);
    keyNameInput.addEventListener('change', updateRule);
    keyValueInput.addEventListener('change', updateRule);

    removeBtn.addEventListener('click', () => {
        settings.registryEditorRules = settings.registryEditorRules.filter(r => r.id !== rule.id);
        saveSettings();
        renderRegistryRules();
        updatePlayerNameVisibility();
    });

    return ruleEl;
}

function renderRegistryRules() {
    if (window.appInfo.platform !== 'win32') return;

    registryRulesList.innerHTML = '';
    if (settings.registryEditorRules && settings.registryEditorRules.length > 0) {
        settings.registryEditorRules.forEach(rule => {
            registryRulesList.appendChild(createRegistryRuleElement(rule));
        });
    } else {
        registryRulesList.innerHTML = '<p class="no-mods">No registry rules added yet.</p>';
    }
}

addRegistryRuleBtn.addEventListener('click', () => {
    const newRule = {
        id: Date.now(),
        regPath: '',
        keyName: '',
        keyValueTemplate: '',
    };
    if (!settings.registryEditorRules) {
      settings.registryEditorRules = [];
    }
    settings.registryEditorRules.push(newRule);
    saveSettings();
    renderRegistryRules();
    updatePlayerNameVisibility();
});


// About Page Editor
function renderAboutPageEditor() {
    const aboutData = settings.aboutPage;
    aboutEditorTitle.value = aboutData.title;
    aboutEditorCreator.value = aboutData.creator;
    aboutEditorWebsite.value = aboutData.website;
    aboutEditorDescription.value = aboutData.description;
}

function handleAboutEditorChange() {
    settings.aboutPage.title = aboutEditorTitle.value;
    settings.aboutPage.creator = aboutEditorCreator.value;
    settings.aboutPage.website = aboutEditorWebsite.value;
    settings.aboutPage.description = aboutEditorDescription.value;
    saveSettings();
    renderAboutPage(); // Update the "About" page live
}

aboutEditorTitle.addEventListener('input', handleAboutEditorChange);
aboutEditorCreator.addEventListener('input', handleAboutEditorChange);
aboutEditorWebsite.addEventListener('input', handleAboutEditorChange);
aboutEditorDescription.addEventListener('input', handleAboutEditorChange);

// Launch Parameters
function renderLaunchParameters() {
    if (!launchParamsContainer) return;
    launchParamsContainer.innerHTML = '';
    if (!settings.launchParameters) settings.launchParameters = {};

    const sortedKeys = Object.keys(LAUNCH_PARAMETERS_CONFIG).sort((a, b) => a.localeCompare(b));

    for (const key of sortedKeys) {
        const config = LAUNCH_PARAMETERS_CONFIG[key];
        const value = settings.launchParameters[key];

        const paramEl = document.createElement('div');
        paramEl.className = 'param-item';

        let controlHtml = '';
        if (config.type === 'bool' || config.type === 'object' || config.type === 'flag') {
            const isChecked = value === true;
            controlHtml = `
                <label class="switch">
                    <input type="checkbox" data-key="${key}" ${isChecked ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>`;
        } else if (config.type === 'string' || config.type === 'int') {
            controlHtml = `<input type="text" data-key="${key}" value="${value || ''}">`;
        }

        paramEl.innerHTML = `
            <div class="param-label">
                <h3>${key}</h3>
                <p>${config.description}</p>
            </div>
            <div class="param-control">
                ${controlHtml}
            </div>
        `;
        
        const control = paramEl.querySelector('[data-key]');
        control.addEventListener('change', (e) => {
            const target = e.target;
            const paramKey = target.dataset.key;
            if (target.type === 'checkbox') {
                settings.launchParameters[paramKey] = target.checked;
            } else {
                settings.launchParameters[paramKey] = target.value;
            }
            saveSettings();
        });

        launchParamsContainer.appendChild(paramEl);
    }
}


// --- INITIALIZATION ---
async function init() {
  refreshMaxButton();

  if (window.appInfo.platform !== 'win32') {
    registryEditorWrapper.style.display = 'none';
  } else {
    registryBackupWrapper.style.display = 'block';
  }

  const data = await window.launcher.getInitialData();

  if (data.error) {
    errorMessage.textContent = data.error;
    errorOverlay.style.display = 'flex';
    return;
  }
  
  document.body.style.backgroundImage = `url('${data.bgPath}')`;
  bgm.src = data.bgmPath;
  
  if (data.settings) {
    settings = { ...settings, ...data.settings };
  }

  // Add default rules if settings for them are empty/undefined
  if (!settings.configEditorRules || settings.configEditorRules.length === 0) {
    settings.configEditorRules = [{
      id: Date.now(),
      filePath: 'C:\\Users\\Noyzen\\Desktop\\7 Days To Die\\7DaysToDie_Data\\Plugins\\x86_64\\steam_emu.ini',
      lineNumber: 29,
      lineTemplate: 'UserName=##7d2dlauncher-username##',
      lineMatch: 'UserName=' 
    }];
  }
  if (window.appInfo.platform === 'win32' && (!settings.registryEditorRules || settings.registryEditorRules.length === 0)) {
    settings.registryEditorRules = [{
      id: Date.now() + 1, // ensure unique id
      regPath: 'HKEY_CURRENT_USER\\SOFTWARE\\The Fun Pimps\\7 Days To Die',
      keyName: 'PlayerName_h775476977',
      keyValueTemplate: '##7d2dlauncher-username##'
    }];
  }

  // Initialize launchParameters with defaults if they don't exist
  if (!settings.launchParameters) {
    settings.launchParameters = {};
  }
  for (const key in LAUNCH_PARAMETERS_CONFIG) {
    if (settings.launchParameters[key] === undefined) {
      const config = LAUNCH_PARAMETERS_CONFIG[key];
      if (config.type === 'bool' || config.type === 'object' || config.type === 'flag') {
        settings.launchParameters[key] = false;
      } else {
        settings.launchParameters[key] = '';
      }
    }
  }

  applySettings();
  renderAboutPage();
  updatePlayerNameVisibility();
  updateHomePageStats();
  renderBackupStatus();
  
  // Start LAN discovery at launch for immediate feedback
  if (!lanChatStarted) {
      window.lan.startDiscovery();
      window.lan.setUsername(settings.playerName || 'Survivor');
      lanChatStarted = true;
  }
}

init();