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
