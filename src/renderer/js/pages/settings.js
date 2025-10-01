import { settings, saveSettings } from '../state.js';
import { formatBytes, showOperationResult, showConfirmationPrompt, showAlert, sanitizeText } from '../ui.js';
import { rendererEvents } from '../events.js';

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

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // General Settings
    document.getElementById('setting-music-toggle').addEventListener('change', (e) => {
        settings.playMusic = e.target.checked;
        saveSettings();
        rendererEvents.emit('music:set-play-state', settings.playMusic);
    });

    document.getElementById('setting-exit-toggle').addEventListener('change', (e) => {
        settings.exitOnLaunch = e.target.checked;
        saveSettings();
    });

    document.getElementById('setting-shortcut-toggle').addEventListener('change', async (e) => {
        const toggle = e.target;
        const shouldCreate = toggle.checked;

        // Prevent immediate state change, we'll set it after user confirmation.
        toggle.checked = !shouldCreate;

        if (shouldCreate) {
            const confirmed = await showConfirmationPrompt(
                'Create Shortcut',
                '<p>Do you want to create a shortcut on your desktop now?</p>',
                'Create Now', 'Later'
            );
            if (confirmed) {
                const result = await window.shortcut.create();
                if (result.success) {
                    await showAlert('Success', '<p>Desktop shortcut has been created.</p>');
                } else {
                    await showAlert('Error', `<p>Could not create shortcut:</p><p>${sanitizeText(result.error)}</p>`);
                }
            }
            // Regardless of confirmation, save the setting to true so it's created on next launch
            settings.createDesktopShortcut = true;
            toggle.checked = true;
            saveSettings();
        } else { // Toggling OFF
            const shortcutExists = await window.shortcut.exists();
            if (shortcutExists) {
                const confirmed = await showConfirmationPrompt(
                    'Remove Shortcut',
                    '<p>Do you want to remove the existing shortcut from your desktop?</p>',
                    'Remove', 'Keep'
                );
                if (confirmed) {
                    const result = await window.shortcut.delete();
                     if (result.success) {
                        await showAlert('Success', '<p>Desktop shortcut has been removed.</p>');
                    } else {
                        await showAlert('Error', `<p>Could not remove shortcut:</p><p>${sanitizeText(result.error)}</p>`);
                    }
                }
            }
            // Save setting to false
            settings.createDesktopShortcut = false;
            toggle.checked = false;
            saveSettings();
        }
    });
    
    document.getElementById('setting-sharing-toggle').addEventListener('change', (e) => {
        settings.isSharingGame = e.target.checked;
        saveSettings();
        window.transfer.toggleSharing(settings.isSharingGame);
    });

    // Backup & Restore
    document.getElementById('backup-btn').addEventListener('click', async () => {
        if (isBackupOperationInProgress) return;
        const confirmed = await showConfirmationPrompt('Confirm Backup', '<p>This will overwrite any existing backup. Continue?</p>', 'Backup', 'Cancel');
        if (!confirmed) return;
        setOperationInProgress(true, 'Backing up files...');
        const result = await window.backup.startBackup();
        setOperationInProgress(false);
        showOperationResult(result.success ? 'File backup complete!' : `Backup failed: ${result.error}`, !result.success);
        renderBackupStatus();
    });

    document.getElementById('restore-btn').addEventListener('click', async () => {
        if (isBackupOperationInProgress) return;
        const confirmed = await showConfirmationPrompt(
            'Confirm Restore',
            '<p><strong>DANGER:</strong> This will delete your current game data and replace it with the backup. This action cannot be undone.</p>',
            'Restore',
            'Cancel'
        );
        if (!confirmed) return;
        setOperationInProgress(true, 'Restoring files...');
        const result = await window.backup.startRestore();
        setOperationInProgress(false);
        showOperationResult(result.success ? 'File restore complete!' : `Restore failed: ${result.error}`, !result.success);
        renderBackupStatus();
    });

    // Registry (Windows only)
    if (window.appInfo.platform === 'win32') {
        document.getElementById('backup-registry-btn').addEventListener('click', async () => {
            if (isBackupOperationInProgress) return;
            const confirmed = await showConfirmationPrompt('Confirm Registry Backup', '<p>This will overwrite any existing registry backup. Continue?</p>', 'Backup', 'Cancel');
            if (!confirmed) return;
            showOperationResult('Backing up registry...');
            const result = await window.backup.startRegistryBackup();
            showOperationResult(result.success ? 'Registry backup successful!' : `Backup failed: ${result.error}`, !result.success);
            renderBackupStatus();
        });
        document.getElementById('restore-registry-btn').addEventListener('click', async () => {
            if (isBackupOperationInProgress) return;
            const confirmed = await showConfirmationPrompt(
                'Confirm Registry Restore',
                '<p><strong>DANGER:</strong> This will overwrite current game registry settings with the backup. This action cannot be undone.</p>',
                'Restore',
                'Cancel'
            );
            if (!confirmed) return;
            showOperationResult('Restoring registry...');
            const result = await window.backup.startRegistryRestore();
            showOperationResult(result.success ? 'Registry restore successful!' : `Restore failed: ${result.error}`, !result.success);
            renderBackupStatus();
        });
    }

    // Progress listener
    window.backup.onProgress(updateProgress);
}

export function init() {
    // Set initial state of toggles
    document.getElementById('setting-music-toggle').checked = settings.playMusic ?? true;
    document.getElementById('setting-exit-toggle').checked = settings.exitOnLaunch ?? false;
    document.getElementById('setting-shortcut-toggle').checked = settings.createDesktopShortcut ?? true;
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
    setupEventListeners();
}