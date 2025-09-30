import { sanitizeText } from '../ui.js';
import { settings } from '../state.js';
import { rendererEvents } from '../events.js';
import { resetUnreadMessages } from '../notifications.js';

let selfId = null;
let subscriptions = [];

function renderPlayerList(peers) {
  const playerListEl = document.getElementById('player-list');
  if (!playerListEl) return;

  playerListEl.innerHTML = '';
  if (!peers || peers.length === 0) {
    playerListEl.innerHTML = '<p class="no-mods">No other players found.</p>';
    return;
  }
  
  // Sort: self first, then alphabetically
  peers.sort((a, b) => {
    if (a.id === selfId) return -1;
    if (b.id === selfId) return 1;
    return a.name.localeCompare(b.name);
  });

  peers.forEach(peer => {
    const playerEl = document.createElement('div');
    playerEl.className = 'player-item';
    if (peer.id === selfId) playerEl.classList.add('is-self');
    playerEl.innerHTML = `
      <div class="status-dot online"></div>
      <div class="player-name-container">
        <span class="player-name" title="${peer.name}">${peer.name} ${peer.id === selfId ? '(You)' : ''}</span>
        <span class="player-os-name">${peer.osUsername || ''} - ${peer.address}</span>
      </div>
    `;
    playerListEl.appendChild(playerEl);
  });
}

function appendChatMessage(message) {
  const chatMessagesEl = document.getElementById('chat-messages');
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
    document.getElementById('chat-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const chatInput = document.getElementById('chat-input');
        const message = chatInput.value.trim();
        if (message) {
            window.lan.sendMessage(message);
            chatInput.value = '';
        }
    });

    subscriptions.push(rendererEvents.on('lan:peer-update', (data) => {
        selfId = data.selfId;
        renderPlayerList(data.list);
    }));

    subscriptions.push(rendererEvents.on('lan:message-received', (message) => {
        appendChatMessage(message);
    }));

    document.getElementById('clear-chat-btn')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to permanently delete the chat history? This cannot be undone.')) {
            await window.lan.clearChatHistory();
            const chatMessagesEl = document.getElementById('chat-messages');
            chatMessagesEl.innerHTML = '<div class="chat-notice">Chat history has been cleared.</div>';
        }
    });
}

export async function init() {
    resetUnreadMessages();
    setupEventListeners();

    const chatMessagesEl = document.getElementById('chat-messages');
    
    // Load chat history
    if (chatMessagesEl) {
        chatMessagesEl.innerHTML = '<div class="chat-notice">Loading history...</div>';
        const history = await window.lan.getChatHistory();
        
        // This is a bit of a hack. Since peer-update is async, selfId might not be set yet.
        // We can get it from the settings object as a fallback for initial render.
        const initialData = await window.lan.onPeerUpdate((data) => { selfId = data.selfId; });

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

export function unmount() {
    subscriptions.forEach(unsubscribe => unsubscribe());
    subscriptions = [];
}