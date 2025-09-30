import { settings, saveSettings, applyInitialSettings, LAUNCH_PARAMETERS_CONFIG, initDefaultSettings } from './state.js';

// --- DOM ELEMENTS ---
const minBtn = document.getElementById('min-btn');
const maxBtn = document.getElementById('max-btn');
const maxIcon = document.getElementById('max-icon');
const closeBtn = document.getElementById('close-btn');
const bgm = document.getElementById('bgm');
const errorOverlay = document.getElementById('error-overlay');
const errorMessage = document.getElementById('error-message');
const sidebarLogo = document.getElementById('sidebar-logo');
const navButtons = document.querySelectorAll('.nav-button');
const contentArea = document.querySelector('.content-area');
const developerNavBtn = document.getElementById('developer-nav-btn');

let logoClickCount = 0;
let logoClickTimer = null;
let lanChatStarted = false;

// --- WINDOW CONTROLS ---
async function refreshMaxButton() {
  const maximized = await window.windowControls.isMaximized();
  document.body.classList.toggle('maximized', maximized);
  maxIcon.classList.toggle('fa-window-maximize', !maximized);
  maxIcon.classList.toggle('fa-window-restore', maximized);
  const text = maximized ? 'Restore' : 'Maximize';
  maxBtn.title = text;
  maxBtn.setAttribute('aria-label', text);
}

function setupWindowControls() {
    minBtn?.addEventListener('click', () => window.windowControls.minimize());
    maxBtn?.addEventListener('click', () => window.windowControls.maximize());
    closeBtn?.addEventListener('click', () => window.windowControls.close());
    window.windowControls.onMaximizeChanged(refreshMaxButton);
    refreshMaxButton();
}

// --- NAVIGATION & PAGE LOADING ---
async function loadPage(pageName) {
    try {
        const response = await fetch(`pages/${pageName}.html`);
        if (!response.ok) throw new Error(`Failed to load page: ${pageName}`);
        contentArea.innerHTML = await response.text();
        
        // Dynamically import and initialize the page's JS module
        const pageModule = await import(`./pages/${pageName}.js`);
        if (pageModule && typeof pageModule.init === 'function') {
            pageModule.init();
        }
    } catch (error) {
        console.error('Page loading error:', error);
        contentArea.innerHTML = `<div class="page active"><p class="error-message">Error: Could not load page content.</p></div>`;
    }
}

function setupNavigation() {
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const pageName = button.dataset.page;
            
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            loadPage(pageName);
        });
    });
}

// --- DEVELOPER MODE ---
function setupDeveloperModeUnlock() {
    sidebarLogo.addEventListener('click', () => {
        logoClickCount++;
        clearTimeout(logoClickTimer);
        logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 2000);
        if (logoClickCount === 7) {
            developerNavBtn.style.display = 'flex';
            logoClickCount = 0;
            clearTimeout(logoClickTimer);
        }
    });
}


// --- INITIALIZATION ---
async function init() {
  setupWindowControls();
  setupNavigation();
  setupDeveloperModeUnlock();

  if (window.appInfo.platform !== 'win32') {
    // Registry editor is a developer tool, hide it if not on windows
    document.head.insertAdjacentHTML('beforeend', `<style>#registry-editor-wrapper { display: none; }</style>`);
  }

  const data = await window.launcher.getInitialData();
  if (data.error) {
    errorMessage.textContent = data.error;
    errorOverlay.style.display = 'flex';
    return;
  }
  
  document.body.style.backgroundImage = `url('${data.bgPath}')`;
  bgm.src = data.bgmPath;
  
  applyInitialSettings(data.settings);
  initDefaultSettings(); // Ensure defaults are set for new features

  // Start LAN discovery
  if (!lanChatStarted) {
      window.lan.startDiscovery();
      window.lan.setUsername(settings.playerName || 'Survivor');
      lanChatStarted = true;
  }

  // Load the initial page
  loadPage('home');
}

init();
