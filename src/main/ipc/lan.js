const { ipcMain } = require('electron');
const dgram = require('dgram');
const path = require('path');
const fs = require('fs');
const os = require('os');
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
let localIpAddress = null;
let broadcastInterval = null;
let peerCheckInterval = null;
let peers = new Map();
let currentUsername = 'Survivor';
let chatHistory = [];
const CHAT_HISTORY_PATH = path.join(LAUNCHER_FILES_PATH, 'chathistory.json');


// --- HELPERS ---

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    const candidates = [];

    // Iterate over all network interfaces
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            // Filter for non-internal IPv4 addresses
            if (net.family === 'IPv4' && !net.internal) {
                // Strict check for private IP ranges, as this is a LAN-only feature.
                const isPrivate = net.address.startsWith('192.168.') ||
                                  net.address.startsWith('10.') ||
                                  /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(net.address);

                if (isPrivate) {
                    // Score interfaces to prioritize physical connections over virtual ones (like VPNs)
                    let score = 0;
                    const lowerName = name.toLowerCase();
                    if (lowerName.includes('ethernet') || lowerName.includes('eth')) {
                        score = 30; // High score for wired connections
                    } else if (lowerName.includes('wi-fi') || lowerName.includes('wlan')) {
                        score = 20; // Medium score for wireless
                    } else {
                        score = 10; // Low score for other interfaces (e.g., virtual, VPN)
                    }
                    candidates.push({ address: net.address, score: score });
                }
            }
        }
    }

    // If no candidates were found, return null
    if (candidates.length === 0) {
        return null;
    }

    // Sort by score descending to get the best candidate first
    candidates.sort((a, b) => b.score - a.score);

    // Return the address of the highest-scored interface
    console.log(`Found LAN IP candidates: ${JSON.stringify(candidates)}. Selected: ${candidates[0].address}`);
    return candidates[0].address;
}

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

  // Keep self alive in the list
  const self = peers.get(INSTANCE_ID);
  if (self) {
      self.lastSeen = now;
  }

  for (const [id, peer] of peers.entries()) {
    if (id === INSTANCE_ID) continue; // Don't time out self
    if (now - peer.lastSeen > PEER_TIMEOUT) {
      peers.delete(id); // Remove peer from the list entirely
      changed = true;
      console.log(`Peer timed out and removed: ${peer.name} [${id}]`);
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
    
    localIpAddress = getLocalIp();
    if (!localIpAddress) {
      console.warn('No suitable private LAN interface found. LAN discovery will not start.');
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
              peers.delete(data.id); // Remove peer from the list entirely
              console.log(`Peer disconnected gracefully and removed: ${data.name} [${data.id}]`);
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
      console.log(`LAN socket bound to port ${LAN_PORT}. Starting discovery...`);
      broadcastInterval = setInterval(() => broadcastPacket('heartbeat'), BROADCAST_INTERVAL);
      broadcastPacket('heartbeat');
      peerCheckInterval = setInterval(checkPeers, BROADCAST_INTERVAL);
    });
  });
}

function handleStopDiscovery() {
  ipcMain.handle('lan:stop-discovery', () => {
    exports.shutdown();
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
  broadcastInterval = null;
  peerCheckInterval = null;
  if (lanSocket) {
    broadcastPacket('disconnect');
    // Give the packet a moment to send before closing
    setTimeout(() => {
        lanSocket.close();
        lanSocket = null;
    }, 100);
  }
  console.log('LAN discovery stopped.');
};

exports.setUsername = (username) => {
  currentUsername = username;
  updatePeer(INSTANCE_ID, currentUsername, OS_USERNAME, localIpAddress || 'local');
  sendPeerUpdate();
  broadcastPacket('heartbeat');
};

exports.getCurrentUsername = () => currentUsername;