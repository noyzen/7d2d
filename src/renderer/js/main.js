import { settings, applyInitialSettings, initDefaultSettings } from './state.js';
import { rendererEvents } from './events.js';
import { incrementUnreadMessages } from './notifications.js';
import { formatBytes } from './ui.js';

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

// --- STATE ---
let logoClickCount = 0;
let logoClickTimer = null;
let lanChatStarted = false;
let selfId = null;
let currentPageModule = null;


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
        // Unmount the previous page's module if it exists and has an unmount function
        if (currentPageModule && typeof currentPageModule.unmount === 'function') {
            currentPageModule.unmount();
            currentPageModule = null;
        }

        const response = await fetch(`pages/${pageName}.html`);
        if (!response.ok) throw new Error(`Failed to load page: ${pageName}`);
        contentArea.innerHTML = await response.text();
        
        // Dynamically import and initialize the page's JS module
        const pageModule = await import(`./pages/${pageName}.js`);
        if (pageModule && typeof pageModule.init === 'function') {
            currentPageModule = pageModule;
            pageModule.init();
        }
    } catch (error) {
        console.error('Page loading error:', error);
        contentArea.innerHTML = `<div class="page active"><div class="page-header"><h1>Error</h1><p>Could not load page content.</p></div></div>`;
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

// --- GLOBAL EVENT LISTENERS ---
function setupGlobalEventListeners() {
    window.lan.onPeerUpdate((data) => {
        selfId = data.selfId;
        rendererEvents.emit('lan:peer-update', data);
    });

    window.lan.onMessageReceived((message) => {
        const chatNavButton = document.querySelector('.nav-button[data-page="chat"]');
        if (selfId && message.id !== selfId && !chatNavButton.classList.contains('active')) {
            incrementUnreadMessages();
        }
        rendererEvents.emit('lan:message-received', message);
    });

    // Transfer Listeners
    window.transfer.onProgress((progress) => {
        document.getElementById('transfer-progress-bar-inner').style.width = `${progress.totalSize > 0 ? (progress.downloadedSize / progress.totalSize) * 100 : 0}%`;
        document.getElementById('transfer-progress-percentage').textContent = `${progress.totalSize > 0 ? Math.round((progress.downloadedSize / progress.totalSize) * 100) : 0}%`;
        
        const detailsEl = document.getElementById('transfer-progress-details');
        const progressText = `(${progress.filesDone}/${progress.totalFiles}) ${progress.currentFile}`;
        detailsEl.textContent = progressText;
        detailsEl.title = progressText; // Add tooltip for long file names
        
        document.getElementById('transfer-progress-speed').textContent = `${formatBytes(progress.speed)}/s`;
    });

    window.transfer.onComplete((result) => {
        const completeMessageEl = document.getElementById('transfer-complete-message');
        document.getElementById('transfer-progress-content').classList.add('hidden');
        document.getElementById('transfer-cancel-btn').classList.add('hidden');
        
        if (result.success) {
            completeMessageEl.className = 'backup-result-message success';
            completeMessageEl.textContent = 'Game download complete! You can now close this window.';
        } else {
            completeMessageEl.className = 'backup-result-message error';
            completeMessageEl.textContent = `Error: ${result.error}`;
        }
        document.getElementById('transfer-close-btn').classList.remove('hidden');
    });

    document.getElementById('transfer-cancel-btn').addEventListener('click', () => {
        window.transfer.cancelDownload();
    });

    document.getElementById('transfer-close-btn').addEventListener('click', () => {
        document.getElementById('transfer-progress-overlay').classList.add('hidden');
    });
}


// --- INITIALIZATION ---
async function init() {
  setupWindowControls();
  setupNavigation();
  setupDeveloperModeUnlock();
  setupGlobalEventListeners();

  const data = await window.launcher.getInitialData();
  if (data.error) {
    errorMessage.textContent = data.error;
    errorOverlay.style.display = 'flex';
    return;
  }
  
  if (data.bgPath) {
    document.body.style.backgroundImage = `url('${data.bgPath}')`;
  } else {
    document.body.classList.add('no-background-image');
  }
  
  if (data.bgmPath) {
    bgm.src = data.bgmPath;
  } else {
    bgm.removeAttribute('src');
  }
  
  applyInitialSettings(data.settings);
  initDefaultSettings(); // Ensure defaults are set for new features

  // Start LAN discovery
  if (!lanChatStarted) {
      window.lan.startDiscovery();
      window.lan.setUsername(settings.playerName || 'Survivor');
      lanChatStarted = true;
  }
  
  if (settings.isSharingGame) {
      window.transfer.toggleSharing(true);
  }

  // Load the initial page
  document.querySelector('.nav-button[data-page="home"]').classList.add('active');
  loadPage('home');
}

init();