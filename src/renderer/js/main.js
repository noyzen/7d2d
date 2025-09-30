import { settings, applyInitialSettings, initDefaultSettings } from './state.js';
import { rendererEvents } from './events.js';
import { incrementUnreadMessages } from './notifications.js';

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
  document.querySelector('.nav-button[data-page="home"]').classList.add('active');
  loadPage('home');
}

init();