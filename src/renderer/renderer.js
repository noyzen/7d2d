// --- STATE ---
let settings = {
  playMusic: true,
  exitOnLaunch: false,
  playerName: 'Survivor',
  configEditorRules: [],
  registryEditorRules: [],
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
const navButtons = document.querySelectorAll('.nav-button');
const pages = document.querySelectorAll('.page');

// Home Page
const startGameBtn = document.getElementById('start-game-btn');
const startGameError = document.getElementById('start-game-error');
const playerNameWrapper = document.getElementById('player-name-wrapper');
const playerNameDisplay = document.getElementById('player-name-display');
const playerNameInput = document.getElementById('player-name-input');
const editPlayerNameBtn = document.getElementById('edit-player-name-btn');

// Mods Page
const enabledModsList = document.getElementById('enabled-mods-list');
const disabledModsList = document.getElementById('disabled-mods-list');

// Settings Page
const musicToggle = document.getElementById('setting-music-toggle');
const exitOnLaunchToggle = document.getElementById('setting-exit-toggle');
const configRulesList = document.getElementById('config-rules-list');
const addConfigRuleBtn = document.getElementById('add-config-rule-btn');
const registryEditorWrapper = document.getElementById('registry-editor-wrapper');
const registryRulesList = document.getElementById('registry-rules-list');
const addRegistryRuleBtn = document.getElementById('add-registry-rule-btn');


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

// Navigation
navButtons.forEach(button => {
  button.addEventListener('click', () => {
    const pageId = button.dataset.page;

    pages.forEach(page => page.classList.toggle('active', page.id === pageId));
    navButtons.forEach(btn => btn.classList.toggle('active', btn === button));
    
    if (pageId === 'page-mods') {
      loadMods();
    } else if (pageId === 'page-settings') {
      renderConfigEditorRules();
      renderRegistryRules();
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
    const newName = playerNameInput.value.trim();
    if (newName) {
        settings.playerName = newName;
    } else {
        settings.playerName = 'Survivor'; // Fallback
    }

    saveSettings();

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
                <label for="line-template-${rule.id}">Line Template (use ##7d2dlauncher-username##)</label>
                <input type="text" id="line-template-${rule.id}" value="${rule.lineTemplate || ''}" placeholder="e.g., PlayerName = ##7d2dlauncher-username##">
            </div>
        </div>
    `;

    // Event Listeners
    const filePathInput = ruleEl.querySelector(`#file-path-${rule.id}`);
    const lineNumInput = ruleEl.querySelector(`#line-num-${rule.id}`);
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

  applySettings();
  updatePlayerNameVisibility();
}

init();