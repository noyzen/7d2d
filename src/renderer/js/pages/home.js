import { settings, saveSettings } from '../state.js';
import { rendererEvents } from '../events.js';

let selfId = null;
let firewallCheckInterval = null;
let subscriptions = [];

// --- HELPERS ---
function getEl(id) { return document.getElementById(id); }

function updatePlayerNameVisibility() {
    const wrapper = getEl('player-name-wrapper');
    if (!wrapper) return;
    const hasConfigRules = settings.configEditorRules && settings.configEditorRules.length > 0;
    const hasRegistryRules = settings.registryEditorRules && settings.registryEditorRules.length > 0;
    wrapper.style.display = (hasConfigRules || hasRegistryRules) ? 'flex' : 'none';
}

async function updateHomePageStats() {
    try {
        const modInfo = await window.mods.get();
        const enabled = modInfo ? modInfo.enabled : [];
        const el = getEl('active-mods-count');
        if (el) el.textContent = enabled.length;
    } catch (e) {
        console.error("Failed to update home page stats:", e);
        const el = getEl('active-mods-count');
        if (el) el.textContent = 'N/A';
    }
}

async function displayFirewallStatus() {
    const card = getEl('firewall-stat-card');
    const statusEl = getEl('firewall-status');
    if (window.appInfo.platform !== 'win32') {
        if (card) card.style.display = 'none';
        return;
    }
    if (!statusEl) return;

    statusEl.textContent = 'Checking...';
    const result = await window.launcher.getFirewallStatus();
    
    // Check if element still exists in case user navigated away
    const currentStatusEl = getEl('firewall-status');
    if (!currentStatusEl) return;

    if (result.status === 'ON') {
        currentStatusEl.textContent = 'ON';
        currentStatusEl.style.color = 'var(--error)';
    } else if (result.status === 'OFF') {
        currentStatusEl.textContent = 'OFF';
        currentStatusEl.style.color = 'var(--primary)';
    } else {
        currentStatusEl.textContent = 'ERROR';
        currentStatusEl.style.color = 'var(--fg-med)';
    }
}

function renderHomePageLanStatus(peers) {
  const homeLanStatus = getEl('home-lan-status');
  if (!homeLanStatus) return;

  if (peers && peers.length > 0) {
    homeLanStatus.classList.remove('hidden');
    getEl('lan-player-count').textContent = peers.length;
    const homePlayerList = getEl('home-player-list');
    homePlayerList.innerHTML = '';
    peers
      .sort((a,b) => a.name.localeCompare(b.name))
      .forEach(peer => {
        const peerEl = document.createElement('div');
        peerEl.className = 'home-player-item';
        peerEl.innerHTML = `<span class="home-player-name">${peer.name}</span><span class="home-player-ip">${peer.address || '...'}</span>`;
        if (peer.id === selfId) {
          peerEl.classList.add('is-self');
          peerEl.querySelector('.home-player-name').textContent += ' (You)';
        }
        homePlayerList.appendChild(peerEl);
    });
  } else {
    homeLanStatus.classList.add('hidden');
  }
}

function saveAndExitEditMode() {
    const playerNameInput = getEl('player-name-input');
    const newName = playerNameInput.value.trim() || 'Survivor';
    if (newName !== settings.playerName) {
        settings.playerName = newName;
        saveSettings();
        window.lan.setUsername(settings.playerName);
    }
    
    getEl('player-name-display').textContent = settings.playerName;
    playerNameInput.value = settings.playerName;
    playerNameInput.classList.add('hidden');
    getEl('player-name-display').classList.remove('hidden');
    getEl('edit-player-name-btn').classList.remove('hidden');
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    const startGameBtn = getEl('start-game-btn');
    startGameBtn?.addEventListener('click', async () => {
        startGameBtn.disabled = true;
        startGameBtn.querySelector('span').textContent = 'LAUNCHING...';
        getEl('start-game-error').textContent = '';
        if (settings.playMusic) getEl('bgm').muted = true;

        const result = await window.launcher.startGame(settings);
        if (result.error) {
            getEl('start-game-error').textContent = result.error;
            startGameBtn.disabled = false;
            startGameBtn.querySelector('span').textContent = 'START GAME';
            if (settings.playMusic) getEl('bgm').muted = false;
        } else if (result.action === 'quitting') {
            startGameBtn.querySelector('span').textContent = 'EXITING...';
        }
    });

    window.launcher.onGameClosed(() => {
        if (settings.playMusic) getEl('bgm').muted = false;
        if(startGameBtn) {
            startGameBtn.disabled = false;
            startGameBtn.querySelector('span').textContent = 'START GAME';
        }
    });

    getEl('go-to-chat-btn')?.addEventListener('click', () => {
        document.querySelector('.nav-button[data-page="chat"]')?.click();
    });

    // Player Name Editing
    const playerNameInput = getEl('player-name-input');
    getEl('edit-player-name-btn')?.addEventListener('click', () => {
        getEl('player-name-display').classList.add('hidden');
        getEl('edit-player-name-btn').classList.add('hidden');
        playerNameInput.classList.remove('hidden');
        playerNameInput.focus();
        playerNameInput.select();
    });
    playerNameInput?.addEventListener('blur', saveAndExitEditMode);
    playerNameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveAndExitEditMode();
        else if (e.key === 'Escape') {
            playerNameInput.value = settings.playerName;
            saveAndExitEditMode();
        }
    });

    subscriptions.push(rendererEvents.on('lan:peer-update', (data) => {
        selfId = data.selfId;
        renderHomePageLanStatus(data.list);
    }));

    subscriptions.push(rendererEvents.on('mods:changed', updateHomePageStats));
}

// --- INIT ---
export function init() {
    const playerName = settings.playerName || 'Survivor';
    const nameDisplay = getEl('player-name-display');
    const nameInput = getEl('player-name-input');
    if (nameDisplay) nameDisplay.textContent = playerName;
    if (nameInput) nameInput.value = playerName;
    
    updatePlayerNameVisibility();
    updateHomePageStats();
    displayFirewallStatus();
    firewallCheckInterval = setInterval(displayFirewallStatus, 15000); // Check every 15s
    
    setupEventListeners();
    
    // Trigger an initial update for LAN status
    window.lan.setUsername(playerName);
}

export function unmount() {
    clearInterval(firewallCheckInterval);
    subscriptions.forEach(unsubscribe => unsubscribe());
    subscriptions = [];
}