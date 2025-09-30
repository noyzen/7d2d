const { ipcMain } = require('electron');
const dgram = require('dgram');
const path = require('path');
const fs = require('fs');
const {
  LAN_PORT,
  BROADCAST_ADDR,
  BROADCAST_INTERVAL,
  PEER_TIMEOUT,
  INSTANCE_ID,
  OS_USERNAME,
  LAUNCHER_FILES_PATH,
} = require('../constants');

let mainWindow;
let lanSocket = null;
let broadcastInterval = null;
let peerCheckInterval = null;
let peers = new Map();
let currentUsername = 'Survivor';
let chatHistory = [];
const CHAT_HISTORY_PATH = path.join(LAUNCHER_FILES_PATH, 'chathistory.json');


// --- HELPERS ---

function loadChatHistory() {
    try {
        if (fs.existsSync(CHAT_HISTORY_PATH)) {
            const data = fs.readFileSync(CHAT_HISTORY_PATH, 'utf-8');
            chatHistory = JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to load chat history:', e);
        chatHistory = [];
    }
}

function saveChatHistory() {
    try {
        fs.writeFileSync(CHAT_HISTORY_PATH, JSON.stringify(chatHistory, null, 2));
    } catch (e) {
        console.error('Failed to save chat history:', e);
    }
}

function appendToHistory(message) {
    chatHistory.push(message);
    if (chatHistory.length > 200) { // Limit history size
        chatHistory.shift();
    }
    saveChatHistory();
}

function updatePeer(id, name, osUsername, address) {
  const now = Date.now();
  const isNew = !peers.has(id);
  if (isNew) {
    console.log(`New peer discovered: ${name} (${osUsername}) [${id}] at ${address}`);
  }
  peers.set(id, { name, osUsername, address, lastSeen: now, status: 'online' });
  return isNew;
}

function sendPeerUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const peerList = Array.from(peers, ([id, value]) => ({ id, ...value }));
    mainWindow.webContents.send('lan:peer-update', {selfId: INSTANCE_ID, list: peerList});
  }
}

function broadcastPacket(type, payload) {
  if (!lanSocket) return;
  const message = Buffer.from(JSON.stringify({
    type,
    id: INSTANCE_ID,
    name: currentUsername,
    osUsername: OS_USERNAME,
    ...payload
  }));
  lanSocket.send(message, 0, message.length, LAN_PORT, BROADCAST_ADDR, (err) => {
    if (err) console.error('Broadcast error:', err);
  });
}

function checkPeers() {
  const now = Date.now();
  let changed = false;
  for (const [id, peer] of peers.entries()) {
    if (peer.status === 'online' && now - peer.lastSeen > PEER_TIMEOUT) {
      peer.status = 'offline';
      changed = true;
      console.log(`Peer timed out: ${peer.name} [${id}]`);
    }
  }
  if (changed) {
    sendPeerUpdate();
  }
}

// --- IPC HANDLERS ---

function handleStartDiscovery() {
  ipcMain.handle('lan:start-discovery', () => {
    if (lanSocket) {
      console.log('LAN discovery already active.');
      return;
    }
    
    lanSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    lanSocket.on('error', (err) => {
      console.error(`LAN socket error:\n${err.stack}`);
      lanSocket.close();
      lanSocket = null;
    });

    lanSocket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (!data.id || data.id === INSTANCE_ID) return;

        switch (data.type) {
          case 'heartbeat':
            if (updatePeer(data.id, data.name, data.osUsername, rinfo.address)) {
              broadcastPacket('heartbeat'); // Announce presence to new peer
            }
            sendPeerUpdate();
            break;
          case 'message':
            if (mainWindow && !mainWindow.isDestroyed()) {
              const messageObject = { id: data.id, name: data.name, osUsername: data.osUsername, text: data.text, timestamp: Date.now() };
              mainWindow.webContents.send('lan:message-received', messageObject);
              appendToHistory(messageObject);
            }
            break;
          case 'disconnect':
            if (peers.has(data.id)) {
              peers.get(data.id).status = 'offline';
              console.log(`Peer disconnected gracefully: ${data.name} [${data.id}]`);
              sendPeerUpdate();
            }
            break;
        }
      } catch (e) {
        console.warn(`Received malformed LAN packet from ${rinfo.address}:${rinfo.port}`);
      }
    });

    lanSocket.bind(LAN_PORT, () => {
      lanSocket.setBroadcast(true);
      console.log('LAN socket bound. Starting discovery...');
      broadcastInterval = setInterval(() => broadcastPacket('heartbeat'), BROADCAST_INTERVAL);
      broadcastPacket('heartbeat');
      peerCheckInterval = setInterval(checkPeers, BROADCAST_INTERVAL);
    });
  });
}

function handleStopDiscovery() {
  ipcMain.handle('lan:stop-discovery', () => {
    if (broadcastInterval) clearInterval(broadcastInterval);
    if (peerCheckInterval) clearInterval(peerCheckInterval);
    if (lanSocket) {
      broadcastPacket('disconnect');
      lanSocket.close();
      lanSocket = null;
    }
    peers.clear();
    broadcastInterval = null;
    peerCheckInterval = null;
    console.log('LAN discovery stopped.');
  });
}

function handleSetUsername() {
  ipcMain.handle('lan:set-username', (_, username) => {
    exports.setUsername(username);
  });
}

function handleSendMessage() {
  ipcMain.handle('lan:send-message', (_, messageText) => {
    if (messageText && messageText.trim().length > 0) {
      const trimmedMessage = messageText.trim();
      broadcastPacket('message', { text: trimmedMessage });
      const messageObject = { id: INSTANCE_ID, name: currentUsername, osUsername: OS_USERNAME, text: trimmedMessage, timestamp: Date.now() };
      if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('lan:message-received', messageObject);
      }
      appendToHistory(messageObject);
    }
  });
}

function handleGetChatHistory() {
    ipcMain.handle('lan:get-chat-history', () => chatHistory);
}

function handleClearChatHistory() {
    ipcMain.handle('lan:clear-chat-history', () => {
        chatHistory = [];
        saveChatHistory();
        return { success: true };
    });
}

// --- EXPORTS ---

exports.init = (mw) => {
  mainWindow = mw;
  loadChatHistory();
  handleStartDiscovery();
  handleStopDiscovery();
  handleSetUsername();
  handleSendMessage();
  handleGetChatHistory();
  handleClearChatHistory();
};

exports.shutdown = () => {
  if (broadcastInterval) clearInterval(broadcastInterval);
  if (peerCheckInterval) clearInterval(peerCheckInterval);
  if (lanSocket) {
    broadcastPacket('disconnect');
    lanSocket.close();
    lanSocket = null;
  }
};

exports.setUsername = (username) => {
  currentUsername = username;
  updatePeer(INSTANCE_ID, currentUsername, OS_USERNAME, '127.0.0.1');
  sendPeerUpdate();
  broadcastPacket('heartbeat');
};

exports.getCurrentUsername = () => currentUsername;