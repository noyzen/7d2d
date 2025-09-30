// --- STATE ---
let settings = {
  playMusic: true
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

// Mods Page
const enabledModsList = document.getElementById('enabled-mods-list');
const disabledModsList = document.getElementById('disabled-mods-list');

// Settings Page
const musicToggle = document.getElementById('setting-music-toggle');


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
    }
  });
});

// Settings
function applySettings() {
  musicToggle.checked = settings.playMusic ?? true;
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


// Home Page
startGameBtn.addEventListener('click', async () => {
  startGameBtn.disabled = true;
  startGameBtn.querySelector('span').textContent = 'LAUNCHING...';
  startGameError.textContent = '';
  
  const result = await window.launcher.startGame();
  if (result.error) {
    startGameError.textContent = result.error;
  }
  
  setTimeout(() => {
    startGameBtn.disabled = false;
    startGameBtn.querySelector('span').textContent = 'START GAME';
  }, 3000);
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


// --- INITIALIZATION ---
async function init() {
  refreshMaxButton();

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
}

init();
