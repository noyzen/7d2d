import { settings, saveSettings } from '../state.js';
import { formatBytes, showOperationResult, sanitizeText } from '../ui.js';

let isBackupOperationInProgress = false;

// --- RENDER FUNCTIONS ---
async function renderBackupStatus() {
    const status = await window.backup.getStatus();
    const container = document.getElementById('backup-status-container');
    if (!status.success) {
        container.innerHTML = `<p class="error-message">Could not get status: ${status.error}</p>`;
        return;
    }

    const { source, backup, freeSpace, registryBackupExists } = status;
    container.innerHTML = `
        <div class="backup-info-grid">
            <div class="backup-info-item"><span>Current Data Size</span><p>${formatBytes(source.totalSize)}</p></div>
            <div class="backup-info-item"><span>Last Backup Size</span><p>${formatBytes(backup.totalSize)}</p></div>
            <div class="backup-info-item"><span>Last Backup Date</span><p>${backup.mtime ? new Date(backup.mtime).toLocaleString() : 'N/A'}</p></div>
            <div class="backup-info-item"><span>Available Space</span><p>${formatBytes(freeSpace)}</p></div>
        </div>`;

    document.getElementById('restore-btn').disabled = backup.totalSize === 0;
    document.getElementById('backup-btn').disabled = source.totalSize === 0;
    
    if (window.appInfo.platform === 'win32') {
        document.getElementById('restore-registry-btn').disabled = !registryBackupExists;
    }
}

function updateProgress(progress) {
    const { totalSize, copiedSize, fileCount, filesCopied, currentFile } = progress;
    const percent = totalSize > 0 ? Math.round((copiedSize / totalSize) * 100) : 0;
    document.getElementById('progress-bar-inner').style.width = `${percent}%`;
    document.getElementById('progress-percentage').textContent = `${percent}%`;
    document.getElementById('progress-details').textContent = `(${filesCopied}/${fileCount}) Copying: ${currentFile}`;
}

function setOperationInProgress(inProgress, label = '') {
    isBackupOperationInProgress = inProgress;
    document.getElementById('backup-controls').classList.toggle('hidden', inProgress);
    if(window.appInfo.platform === 'win32') {
        document.getElementById('registry-backup-wrapper').querySelector(".backup-controls").classList.toggle('hidden', inProgress);
    }
    document.getElementById('backup-progress-container').classList.toggle('hidden', !inProgress);
    if (inProgress) {
        document.getElementById('progress-label').textContent = label;
        showOperationResult('');
    }
}

function renderHostStatus(downloaders) {
    const panel = document.getElementById('host-status-panel');
    if (!panel) return;

    if (settings.isSharingGame) {
        panel.classList.remove('hidden');
        document.getElementById('host-downloader-count').textContent = downloaders.length;
        const listEl = document.getElementById('host-downloader-list');
        if (downloaders.length > 0) {
            listEl.innerHTML = downloaders.map(ip => `<li>${sanitizeText(ip)}</li>`).join('');
        } else {
            listEl.innerHTML = '<li>No active downloads.</li>';
        }
    } else {
        panel.classList.add('hidden');
    }
}


// --- EVENT LISTENERS ---
function setupEventListeners() {
    // General Settings
    document.getElementById('setting-music-toggle').addEventListener('change', (e) => {
        settings.playMusic = e.target.checked;
        saveSettings();
        const bgm = document.getElementById('bgm');
        settings.playMusic ? bgm.play() : bgm.pause();
    });

    document.getElementById('setting-exit-toggle').addEventListener('change', (e) => {
        settings.exitOnLaunch = e.target.checked;
        saveSettings();
    });
    
    document.getElementById('setting-sharing-toggle').addEventListener('change', (e) => {
        settings.isSharingGame = e.target.checked;
        saveSettings();
        window.transfer.toggleSharing(settings.isSharingGame);
        // Immediately update visibility of host panel
        renderHostStatus([]); 
    });

    // Backup & Restore
    document.getElementById('backup-btn').addEventListener('click', async () => {
        if (isBackupOperationInProgress || !confirm('This will overwrite any existing backup. Continue?')) return;
        setOperationInProgress(true, 'Backing up files...');
        const result = await window.backup.startBackup();
        setOperationInProgress(false);
        showOperationResult(result.success ? 'File backup complete!' : `Backup failed: ${result.error}`, !result.success);
        renderBackupStatus();
    });

    document.getElementById('restore-btn').addEventListener('click', async () => {
        if (isBackupOperationInProgress || !confirm('DANGER: This will delete your current game data and replace it with the backup. Continue?')) return;
        setOperationInProgress(true, 'Restoring files...');
        const result = await window.backup.startRestore();
        setOperationInProgress(false);
        showOperationResult(result.success ? 'File restore complete!' : `Restore failed: ${result.error}`, !result.success);
        renderBackupStatus();
    });

    // Registry (Windows only)
    if (window.appInfo.platform === 'win32') {
        document.getElementById('backup-registry-btn').addEventListener('click', async () => {
            if (isBackupOperationInProgress || !confirm('This will overwrite any existing registry backup. Continue?')) return;
            showOperationResult('Backing up registry...');
            const result = await window.backup.startRegistryBackup();
            showOperationResult(result.success ? 'Registry backup successful!' : `Backup failed: ${result.error}`, !result.success);
            renderBackupStatus();
        });
        document.getElementById('restore-registry-btn').addEventListener('click', async () => {
            if (isBackupOperationInProgress || !confirm('DANGER: This will overwrite current game registry settings with the backup. Continue?')) return;
            showOperationResult('Restoring registry...');
            const result = await window.backup.startRegistryRestore();
            showOperationResult(result.success ? 'Registry restore successful!' : `Restore failed: ${result.error}`, !result.success);
            renderBackupStatus();
        });
    }

    // Progress listener
    window.backup.onProgress(updateProgress);
    // Host status listener
    window.transfer.onActiveDownloadsUpdate(renderHostStatus);
}

export function init() {
    // Set initial state of toggles
    document.getElementById('setting-music-toggle').checked = settings.playMusic ?? true;
    document.getElementById('setting-exit-toggle').checked = settings.exitOnLaunch ?? false;
    document.getElementById('setting-sharing-toggle').checked = settings.isSharingGame ?? false;
    
    // Show registry backup section on Windows
    if (window.appInfo.platform === 'win32') {
        document.getElementById('registry-backup-wrapper').style.display = 'block';
    }

    // Hide music toggle if no music file is loaded
    const musicToggleWrapper = document.getElementById('setting-music-wrapper');
    const bgm = document.getElementById('bgm');
    if (musicToggleWrapper && !bgm.hasAttribute('src')) {
        musicToggleWrapper.style.display = 'none';
    }

    renderBackupStatus();
    renderHostStatus([]); // Initial render
    setupEventListeners();
}