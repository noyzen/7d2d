// This file contains shared UI utility functions and element selectors.

/**
 * Formats a number of bytes into a human-readable string (KB, MB, GB).
 * @param {number} bytes - The number of bytes.
 * @param {number} [decimals=2] - The number of decimal places.
 * @returns {string} The formatted string.
 */
export function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Displays a result message for an operation (e.g., backup/restore).
 * @param {string} message - The message to display.
 * @param {boolean} [isError=false] - Whether the message is an error.
 */
export function showOperationResult(message, isError = false) {
    const el = document.getElementById('backup-result-message');
    if (!el) return;
    el.textContent = message;
    el.className = `backup-result-message ${isError ? 'error' : 'success'}`;
    setTimeout(() => {
        el.className = 'backup-result-message';
    }, 5000);
}

/**
 * A simple helper to sanitize text to prevent HTML injection.
 * @param {string} text - The input string.
 * @returns {string} The sanitized string.
 */
export function sanitizeText(text) {
    const temp = document.createElement('div');
    temp.textContent = text;
    return temp.innerHTML;
}

/**
 * Shows a custom prompt modal and returns a promise that resolves with the user's input.
 * @param {string} title - The title of the modal.
 * @param {string} text - The descriptive text inside the modal.
 * @param {string} [defaultValue=''] - The default value for the input field.
 * @returns {Promise<string|null>} A promise that resolves with the input string, or null if canceled.
 */
export function showPrompt(title, text, defaultValue = '') {
    const overlay = document.getElementById('custom-prompt-overlay');
    const titleEl = document.getElementById('custom-prompt-title');
    const textEl = document.getElementById('custom-prompt-text');
    const inputEl = document.getElementById('custom-prompt-input');
    const okBtn = document.getElementById('custom-prompt-ok-btn');
    const cancelBtn = document.getElementById('custom-prompt-cancel-btn');

    if (!overlay || !inputEl || !okBtn || !cancelBtn) {
        return Promise.reject('Prompt modal elements not found in the DOM.');
    }

    titleEl.textContent = title;
    textEl.innerHTML = sanitizeText(text); // Use innerHTML in case text has simple formatting needs, but sanitize it.
    inputEl.value = defaultValue;
    inputEl.style.display = 'block';


    overlay.classList.remove('hidden');
    inputEl.focus();
    inputEl.select();

    return new Promise((resolve) => {
        const close = (value) => {
            overlay.classList.add('hidden');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            inputEl.onkeydown = null;
            resolve(value);
        };

        okBtn.onclick = () => {
            close(inputEl.value.trim());
        };

        cancelBtn.onclick = () => {
            close(null);
        };
        
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                okBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelBtn.click();
            }
        };
    });
}

/**
 * Shows a themed confirmation dialog.
 * @param {string} title - The title for the dialog.
 * @param {string} htmlContent - The HTML content for the dialog's body.
 * @param {string} [confirmText='Confirm'] - The text for the confirmation button.
 * @param {string} [cancelText='Cancel'] - The text for the cancel button.
 * @returns {Promise<boolean>} A promise that resolves with true if confirmed, false otherwise.
 */
export function showConfirmationPrompt(title, htmlContent, confirmText = 'Confirm', cancelText = 'Cancel') {
    const overlay = document.getElementById('confirmation-overlay');
    const titleEl = document.getElementById('confirmation-title');
    const textEl = document.getElementById('confirmation-text');
    const okBtn = document.getElementById('confirmation-ok-btn');
    const cancelBtn = document.getElementById('confirmation-cancel-btn');

    if (!overlay || !titleEl || !textEl || !okBtn || !cancelBtn) {
        return Promise.reject('Confirmation modal elements not found in the DOM.');
    }

    titleEl.textContent = title;
    textEl.innerHTML = htmlContent;
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    overlay.classList.remove('hidden');
    okBtn.focus();

    return new Promise((resolve) => {
        const close = (value) => {
            overlay.classList.add('hidden');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            document.onkeydown = null;
            resolve(value);
        };

        okBtn.onclick = () => close(true);
        cancelBtn.onclick = () => close(false);
        
        document.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                okBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelBtn.click();
            }
        };
    });
}


export function showHostSelectionPrompt(hosts) {
    const overlay = document.getElementById('custom-prompt-overlay');
    const titleEl = document.getElementById('custom-prompt-title');
    const textEl = document.getElementById('custom-prompt-text');
    const inputEl = document.getElementById('custom-prompt-input');
    const okBtn = document.getElementById('custom-prompt-ok-btn');
    const cancelBtn = document.getElementById('custom-prompt-cancel-btn');

    titleEl.textContent = 'Select a Host to Download From';
    inputEl.style.display = 'none';

    let hostListHtml = '<div class="host-list">';
    hosts.forEach((host, index) => {
        hostListHtml += `
            <label class="host-item" for="host-radio-${index}">
                <input type="radio" name="host-selection" id="host-radio-${index}" value="${host.id}">
                <div class="player-name-container">
                    <span class="player-name">${sanitizeText(host.name)}</span>
                    <span class="player-os-name">${sanitizeText(host.osUsername)} - ${sanitizeText(host.address)}</span>
                </div>
            </label>
        `;
    });
    hostListHtml += '</div>';

    const optionsHtml = `
        <div class="download-options">
            <label for="download-type-full">
                <input type="radio" name="download-type" id="download-type-full" value="full" checked>
                Full Game (Overwrites current game folder)
            </label>
            <label for="download-type-launcher">
                <input type="radio" name="download-type" id="download-type-launcher" value="launcher">
                Launcher Only (Updates launcher and its files)
            </label>
        </div>
    `;

    textEl.innerHTML = `<div id="custom-prompt-content">${hostListHtml}${optionsHtml}</div>`;
    overlay.classList.remove('hidden');

    return new Promise((resolve) => {
        const close = (value) => {
            overlay.classList.add('hidden');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            textEl.innerHTML = '';
            resolve(value);
        };

        okBtn.onclick = () => {
            const selectedHostId = document.querySelector('input[name="host-selection"]:checked')?.value;
            const selectedType = document.querySelector('input[name="download-type"]:checked')?.value;
            if (selectedHostId && selectedType) {
                const selectedHost = hosts.find(h => h.id === selectedHostId);
                close({ host: selectedHost, type: selectedType });
            } else {
                alert('Please select a host and a download type.');
            }
        };

        cancelBtn.onclick = () => {
            close(null);
        };
    });
}


// --- Dynamic Element Getters ---
// We use functions because the elements don't exist until the page is loaded.

export const get = {
    // Chat
    chatPage: () => document.getElementById('page-chat'),
    playerList: () => document.getElementById('player-list'),
    chatMessages: () => document.getElementById('chat-messages'),
    chatForm: () => document.getElementById('chat-form'),
    chatInput: () => document.getElementById('chat-input'),
    chatNotificationBadge: () => document.getElementById('chat-notification-badge'),
};