import { settings, saveSettings } from '../state.js';
import { rendererEvents } from '../events.js';
import { showHostSelectionPrompt, showConfirmationPrompt, sanitizeText, showAlert } from '../ui.js';

let selfId = null;
let firewallCheckInterval = null;
let subscriptions = [];
let knownPeerIds = new Set();
let allPeers = [];

// --- HELPERS ---
function getEl(id) { return document.getElementById(id); }

async function checkAndDisplayFirewallWarning() {
    const container = getEl('firewall-warning-container');
    if (!container || window.appInfo.platform !== 'win32') return;

    const result = await window.launcher.getFirewallStatus();
    if (result.status === 'ON') {
        container.innerHTML = `
            <div class="firewall-warning">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>
                    <strong>Firewall Active:</strong> LAN features like player discovery and chat may not work correctly.
                    Please ensure this application is allowed through your firewall for private networks.
                </p>
            </div>
        `;
    } else {
        container.innerHTML = '';
    }
}

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

    const result = await window.launcher.getFirewallStatus();
    
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
  allPeers = peers || [];
  const homeLanStatus = getEl('home-lan-status');
  if (!homeLanStatus) return;
  
  const newPeerIds = new Set(peers?.map(p => p.id) || []);

  if (peers && peers.length > 0) {
    homeLanStatus.classList.remove('hidden');
    getEl('lan-player-count').textContent = peers.length;
    const homePlayerList = getEl('home-player-list');
    homePlayerList.innerHTML = '';
    peers
      .sort((a,b) => {
        if (a.id === selfId) return -1;
        if (b.id === selfId) return 1;
        return a.name.localeCompare(b.name);
      })
      .forEach(peer => {
        const peerEl = document.createElement('div');
        peerEl.className = 'home-player-item';
        
        if (!knownPeerIds.has(peer.id)) {
            peerEl.classList.add('new');
        }

        peerEl.innerHTML = `
            <div class="status-dot online"></div>
            <div class="home-player-name-container">
                <span class="home-player-name">${peer.name} ${peer.isSharing ? ' <i class="fa-solid fa-share-from-square" title="Sharing Game Files"></i>' : ''}</span>
                <span class="home-player-os-name">${peer.osUsername || ''} - ${peer.address || '...'}</span>
            </div>
        `;
        if (peer.id === selfId) {
          peerEl.classList.add('is-self');
          peerEl.querySelector('.home-player-name').innerHTML += ' (You)';
        }
        homePlayerList.appendChild(peerEl);
    });
    knownPeerIds = newPeerIds;
  } else {
    homeLanStatus.classList.add('hidden');
    knownPeerIds = new Set();
  }

  const downloadBtn = getEl('download-game-btn');
  const sharingPeers = peers.filter(p => p.isSharing && p.id !== selfId);
  downloadBtn.style.display = sharingPeers.length > 0 ? 'flex' : 'none';
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

async function handleDownloadError(error) {
    if (error === 'requires-admin') {
        const confirmed = await showConfirmationPrompt(
            'Administrator Rights Required',
            `<p>This operation requires administrator privileges to modify game files in a protected directory.</p>
             <p>Do you want to restart the launcher as an administrator to continue?</p>`,
            'Restart as Admin', 'Cancel'
        );
        if (confirmed) await window.launcher.relaunchAsAdmin();
    } else {
        await showAlert('Download Failed', `<p>An unexpected error occurred:</p><div class="modal-path-display" style="color: var(--error);">${sanitizeText(error)}</div>`);
    }
}

function renderHostDashboard(downloaders) {
    const listEl = getEl('downloader-list');
    if (!listEl) return;
    
    if (downloaders.length > 0) {
        listEl.innerHTML = downloaders.map(d => `
            <div class="downloader-item">
                <div class="downloader-info">
                    <div>
                        <div class="downloader-name">${sanitizeText(d.playerName)}</div>
                        <div class="downloader-details">${sanitizeText(d.osUsername)} - ${sanitizeText(d.ip)}</div>
                    </div>
                    <div class="downloader-progress-percent">${d.progress}%</div>
                </div>
                <div class="downloader-progress-bar">
                    <div class="downloader-progress-bar-inner" style="width: ${d.progress}%;"></div>
                </div>
            </div>
        `).join('');
    } else {
        listEl.innerHTML = '<p class="no-mods" style="text-align: center;">No active downloads.</p>';
    }
}

function checkDashboardVisibility() {
    const dashboard = getEl('host-dashboard');
    if (dashboard) {
        dashboard.style.display = settings.isSharingGame ? 'flex' : 'none';
    }
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

    getEl('download-game-btn').addEventListener('click', async () => {
        const sharingPeers = allPeers.filter(p => p.isSharing && p.id !== selfId);
        if (sharingPeers.length === 0) return;

        const selection = await showHostSelectionPrompt(sharingPeers);
        if (!selection) return;

        const { host } = selection;
        const gamePath = await window.launcher.getGamePath();
        const safeGamePath = sanitizeText(gamePath);
        
        const confirmed = await showConfirmationPrompt('Confirm Full Game Download', `
            <p><strong>DANGER!</strong> This will <strong>DELETE KNOWN GAME FILES</strong> inside the directory below and replace them with files from the host.</p>
            <div class="modal-path-display">${safeGamePath}</div>
            <p>This action cannot be undone. Are you sure?</p>`, 'Confirm', 'Cancel'
        );

        if (confirmed) {
            document.getElementById('bgm').pause();

            const overlay = document.getElementById('transfer-progress-overlay');
            document.getElementById('transfer-progress-title').textContent = 'Downloading Full Game...';
            document.getElementById('transfer-progress-content').classList.remove('hidden');
            document.getElementById('transfer-complete-message').textContent = '';
            document.getElementById('transfer-close-btn').classList.add('hidden');
            document.getElementById('transfer-cancel-btn').classList.remove('hidden');
            overlay.classList.remove('hidden');
            
            const result = await window.transfer.downloadGame({ host, playerName: settings.playerName });
            if (!result.success && result.error !== 'cancelled') {
                overlay.classList.add('hidden');
                handleDownloadError(result.error);
            }
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
    subscriptions.push(rendererEvents.on('settings:changed', checkDashboardVisibility));
    subscriptions.push(rendererEvents.on('transfer:active-downloads-update', renderHostDashboard));
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
    checkAndDisplayFirewallWarning();
    checkDashboardVisibility();

    const statusEl = getEl('firewall-status');
    if(statusEl && statusEl.textContent === 'N/A') {
        statusEl.textContent = 'Checking...';
    }

    displayFirewallStatus();
    firewallCheckInterval = setInterval(displayFirewallStatus, 15000);
    
    setupEventListeners();
    
    window.lan.setUsername(playerName);
}

export function unmount() {
    clearInterval(firewallCheckInterval);
    subscriptions.forEach(unsubscribe => unsubscribe());
    subscriptions = [];
    knownPeerIds = new Set();
    allPeers = [];
}