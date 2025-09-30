// --- STATE ---
let settings = {
  playMusic: true,
  exitOnLaunch: false,
  playerName: 'Survivor',
  configEditorRules: [],
  registryEditorRules: [],
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
    } else if (pageId === 'page-chat') {
      // Clear notifications when entering chat
      unreadMessageCount = 0;
      updateUnreadBadge();
      // Scroll to the latest message
      chatMessages.scrollTop = chatMessages.scrollHeight;
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


// --- INITIALIZATION ---
async function init() {
  refreshMaxButton();

  if (window.appInfo.platform !== 'win32') {
    registryEditorWrapper.style.display = 'none';
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

  applySettings();
  renderAboutPage();
  updatePlayerNameVisibility();
  updateHomePageStats();
  
  // Start LAN discovery at launch for immediate feedback
  if (!lanChatStarted) {
      window.lan.startDiscovery();
      window.lan.setUsername(settings.playerName || 'Survivor');
      lanChatStarted = true;
  }
}

init();