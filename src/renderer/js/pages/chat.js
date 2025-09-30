import { get, sanitizeText } from '../ui.js';
import { settings } from '../state.js';

let selfId = null;
let unreadMessageCount = 0;

function updateUnreadBadge() {
  const badge = get.chatNotificationBadge();
  if (!badge) return;
  if (unreadMessageCount > 0) {
    badge.textContent = unreadMessageCount > 9 ? '9+' : unreadMessageCount;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

function renderPlayerList(peers) {
  const playerListEl = get.playerList();
  if (!playerListEl) return;

  playerListEl.innerHTML = '';
  if (!peers || peers.length === 0) {
    playerListEl.innerHTML = '<p class="no-mods">No other players found.</p>';
    return;
  }
  
  peers.sort((a, b) => {
    if (a.id === selfId) return -1;
    if (b.id === selfId) return 1;
    if (a.status !== b.status) return a.status === 'online' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  peers.forEach(peer => {
    const playerEl = document.createElement('div');
    playerEl.className = 'player-item';
    if (peer.id === selfId) playerEl.classList.add('is-self');
    playerEl.innerHTML = `
      <div class="status-dot ${peer.status}"></div>
      <div class="player-name-container">
        <span class="player-name" title="${peer.name}">${peer.name} ${peer.id === selfId ? '(You)' : ''}</span>
        <span class="player-os-name">${peer.osUsername || ''} - ${peer.address}</span>
      </div>
    `;
    playerListEl.appendChild(playerEl);
  });
}

function appendChatMessage(message) {
  const chatMessagesEl = get.chatMessages();
  if (!chatMessagesEl) return;
  const isSelf = message.id === selfId;
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';
  if (isSelf) messageEl.classList.add('is-self');

  const timestamp = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  messageEl.innerHTML = `
    <div class="message-header">
      <span class="message-sender">${sanitizeText(message.name)} <span class="message-os-sender">(${sanitizeText(message.osUsername || '...')})</span></span>
      <span class="message-timestamp">${timestamp}</span>
    </div>
    <div class="message-bubble">${sanitizeText(message.text)}</div>
  `;

  const shouldScroll = chatMessagesEl.scrollTop + chatMessagesEl.clientHeight >= chatMessagesEl.scrollHeight - 20;
  chatMessagesEl.appendChild(messageEl);
  if (shouldScroll) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function setupEventListeners() {
    get.chatForm()?.addEventListener('submit', (e) => {
        e.preventDefault();
        const chatInput = get.chatInput();
        const message = chatInput.value.trim();
        if (message) {
            window.lan.sendMessage(message);
            chatInput.value = '';
        }
    });

    window.lan.onPeerUpdate((data) => {
        selfId = data.selfId;
        renderPlayerList(data.list);
    });

    window.lan.onMessageReceived((message) => {
        // Prevent duplicate self-messages from appearing
        if (message.id === selfId && document.querySelector('.chat-message:last-child')?.textContent.includes(message.text)) {
            return;
        }
        appendChatMessage(message);
        if (message.id !== selfId && !document.querySelector('.nav-button[data-page="chat"]').classList.contains('active')) {
            unreadMessageCount++;
            updateUnreadBadge();
        }
    });

    document.getElementById('clear-chat-btn')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to permanently delete the chat history? This cannot be undone.')) {
            await window.lan.clearChatHistory();
            const chatMessagesEl = get.chatMessages();
            chatMessagesEl.innerHTML = '<div class="chat-notice">Chat history has been cleared.</div>';
        }
    });
}

export async function init() {
    // Clear notifications on entering chat page
    unreadMessageCount = 0;
    updateUnreadBadge();
    setupEventListeners();

    const chatMessagesEl = get.chatMessages();
    
    // Load chat history
    if (chatMessagesEl) {
        chatMessagesEl.innerHTML = '<div class="chat-notice">Loading history...</div>';
        const history = await window.lan.getChatHistory();
        
        chatMessagesEl.innerHTML = '';
        if (history.length > 0) {
            history.forEach(appendChatMessage);
        } else {
            chatMessagesEl.innerHTML = '<div class="chat-notice">Welcome to the LAN chat! Messages are saved between sessions.</div>';
        }
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
    
    // Trigger an update for peer list
    window.lan.setUsername(settings.playerName || 'Survivor');
}