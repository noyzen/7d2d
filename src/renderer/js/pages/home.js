import { settings, saveSettings } from '../state.js';

let selfId = null;

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
        const { enabled } = await window.mods.get();
        getEl('active-mods-count').textContent = enabled.length;
    } catch (e) {
        console.error("Failed to update home page stats:", e);
        getEl('active-mods-count').textContent = 'N/A';
    }
}

async function displayFirewallStatus() {
    const card = getEl('firewall-stat-card');
    const statusEl = getEl('firewall-status');
    if (window.appInfo.platform !== 'win32') {
        card.style.display = 'none';
        return;
    }
    statusEl.textContent = 'Checking...';
    const result = await window.launcher.getFirewallStatus();
    if (result.status === 'ON') {
        statusEl.textContent = 'ON';
        statusEl.style.color = 'var(--error)';
    } else if (result.status === 'OFF') {
        statusEl.textContent = 'OFF';
        statusEl.style.color = 'var(--primary)';
    } else {
        statusEl.textContent = 'ERROR';
        statusEl.style.color = 'var(--fg-med)';
    }
}

function renderHomePageLanStatus(peers) {
  const homeLanStatus = getEl('home-lan-status');
  if (!homeLanStatus) return;
  const onlinePeers = peers.filter(p => p.status === 'online');

  if (onlinePeers.length > 1) { 
    homeLanStatus.classList.remove('hidden');
    getEl('lan-player-count').textContent = onlinePeers.length;
    const homePlayerList = getEl('home-player-list');
    homePlayerList.innerHTML = ''; // Clear spinner
    onlinePeers
      .sort((a,b) => a.name.localeCompare(b.name))
      .forEach(peer => {
        const peerEl = document.createElement('div');
        peerEl.className = 'home-player-item';
        peerEl.innerHTML = `<span class="home-player-name">${peer.name}</span><span class="home-player-ip">${peer.address}</span>`;
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
    startGameBtn.addEventListener('click', async () => {
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
        startGameBtn.disabled = false;
        startGameBtn.querySelector('span').textContent = 'START GAME';
    });

    getEl('go-to-chat-btn').addEventListener('click', () => {
        document.querySelector('.nav-button[data-page="chat"]').click();
    });

    // Player Name Editing
    const playerNameInput = getEl('player-name-input');
    getEl('edit-player-name-btn').addEventListener('click', () => {
        getEl('player-name-display').classList.add('hidden');
        getEl('edit-player-name-btn').classList.add('hidden');
        playerNameInput.classList.remove('hidden');
        playerNameInput.focus();
        playerNameInput.select();
    });
    playerNameInput.addEventListener('blur', saveAndExitEditMode);
    playerNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveAndExitEditMode();
        else if (e.key === 'Escape') {
            playerNameInput.value = settings.playerName;
            saveAndExitEditMode();
        }
    });

    window.lan.onPeerUpdate((data) => {
        selfId = data.selfId;
        renderHomePageLanStatus(data.list);
    });
}

// --- INIT ---
export function init() {
    const playerName = settings.playerName || 'Survivor';
    getEl('player-name-display').textContent = playerName;
    getEl('player-name-input').value = playerName;
    
    updatePlayerNameVisibility();
    updateHomePageStats();
    displayFirewallStatus();
    setupEventListeners();
    
    // Trigger an update for LAN status
    window.lan.setUsername(playerName);
}