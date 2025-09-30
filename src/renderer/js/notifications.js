let unreadMessageCount = 0;
const badge = document.getElementById('chat-notification-badge');

function updateBadge() {
    if (!badge) return;
    if (unreadMessageCount > 0) {
        badge.textContent = unreadMessageCount > 9 ? '9+' : unreadMessageCount;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

export function incrementUnreadMessages() {
    unreadMessageCount++;
    updateBadge();
}

export function resetUnreadMessages() {
    unreadMessageCount = 0;
    updateBadge();
}
