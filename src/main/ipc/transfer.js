const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { CWD, OS_USERNAME } = require('../constants');
const lanIpc = require('./lan');

let mainWindow;
let fileServer = null;
const activeDownloaders = new Map(); // Host-side state
let downloadersUpdateInterval = null;

let currentDownload = { isCancelled: false, request: null }; // Client-side state

// This is the single source of truth for all files and folders that are part of a game transfer.
// The running launcher '7d2dLauncher.exe' is INTENTIONALLY OMITTED.
const GAME_ASSETS_TO_TRANSFER = [
    // Folders
    '#Steam-Manifests', '7DaysToDie_Data', 'BackupData', 'Data',
    'DisabledMods', 'EasyAntiCheat', 'Launcher', 'LauncherFiles',
    'Licenses', 'Logos', 'Mods', 'MonoBleedingEdge',
    // Files
    '7DaysToDie.exe', '7DaysToDie_EAC.exe', '7dLauncher.exe',
    'installscript.vdf', 'MicrosoftGame.Config', 'nvngx_dlss.dll',
    'NVUnityPlugin.dll', 'platform.cfg', 'platform.cfg.legit',
    'serverconfig.xml', 'startdedicated.bat', 'steamclient64.dll',
    'steam_appid.txt', 'tier0_s64.dll', 'UnityCrashHandler64.exe',
    'UnityCrashHandler64.pdb', 'UnityPlayer.dll',
    'UnityPlayer_Win64_player_mono_x64.pdb', 'vstdlib_s64.dll',
    'WindowsPlayer_player_Master_mono_x64.pdb'
];

// --- FILE SERVER HELPERS (HOST) ---

function broadcastDownloadersUpdate() {
    const now = Date.now();
    let changed = false;
    // Timeout inactive downloaders
    for (const [ip, data] of activeDownloaders.entries()) {
        if (now - data.lastSeen > 15000) { // 15 second timeout
            activeDownloaders.delete(ip);
            changed = true;
        }
    }
    
    const downloadersList = Array.from(activeDownloaders.values());
    mainWindow?.webContents.send('transfer:active-downloads-update', downloadersList);

    if (changed && activeDownloaders.size === 0) {
        // If the last downloader was just removed, send one more update.
        mainWindow?.webContents.send('transfer:active-downloads-update', []);
    }
}

/**
 * Generates a file list by walking through the GAME_ASSETS_TO_TRANSFER safelist.
 * This ensures no unexpected files (like the running .exe) are ever offered for download.
 */
async function listAllowedFiles() {
    const fileList = [];
    
    async function walkDirRecursive(startDir, relativeBase) {
        const entries = await fs.promises.readdir(startDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(startDir, entry.name);
            const relativePath = path.join(relativeBase, entry.name);
            if (entry.isDirectory()) {
                fileList.push({ path: relativePath.replace(/\\/g, '/'), type: 'dir' });
                await walkDirRecursive(fullPath, relativePath);
            } else {
                const stats = await fs.promises.stat(fullPath);
                fileList.push({ path: relativePath.replace(/\\/g, '/'), size: stats.size, type: 'file' });
            }
        }
    }

    for (const assetName of GAME_ASSETS_TO_TRANSFER) {
        const fullPath = path.join(CWD, assetName);
        if (!fs.existsSync(fullPath)) continue;

        const stats = await fs.promises.stat(fullPath);
        if (stats.isDirectory()) {
            fileList.push({ path: assetName.replace(/\\/g, '/'), type: 'dir' });
            await walkDirRecursive(fullPath, assetName);
        } else {
            fileList.push({ path: assetName.replace(/\\/g, '/'), size: stats.size, type: 'file' });
        }
    }
    return fileList;
}

function startFileServer() {
    return new Promise((resolve, reject) => {
        if (fileServer) {
            return resolve(fileServer.address().port);
        }
        const server = http.createServer(async (req, res) => {
            const ip = req.socket.remoteAddress;
            const url = new URL(req.url, `http://${req.headers.host}`);
            res.setHeader('Access-Control-Allow-Origin', '*');

            if (url.pathname === '/list-files' && req.method === 'GET') {
                try {
                    const files = await listAllowedFiles();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(files));
                } catch (e) {
                    res.writeHead(500).end(JSON.stringify({ error: e.message }));
                }
            } else if (url.pathname === '/get-file' && req.method === 'GET') {
                try {
                    const filePath = url.searchParams.get('path');
                    if (!filePath) throw new Error('File path is required.');
                    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
                    const fullPath = path.join(CWD, safePath);
                    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
                        return res.writeHead(404).end('File not found.');
                    }
                    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
                    fs.createReadStream(fullPath).pipe(res);
                } catch (e) {
                    res.writeHead(500).end(JSON.stringify({ error: e.message }));
                }
            } else if (url.pathname === '/register-downloader' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    const { playerName, osUsername } = JSON.parse(body);
                    activeDownloaders.set(ip, { ip, playerName, osUsername, progress: 0, lastSeen: Date.now() });
                    broadcastDownloadersUpdate();
                    res.writeHead(200).end();
                });
            } else if (url.pathname === '/report-progress' && req.method === 'POST') {
                 let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    try {
                        const { progress } = JSON.parse(body);
                        if (activeDownloaders.has(ip)) {
                            const downloader = activeDownloaders.get(ip);
                            downloader.progress = progress;
                            downloader.lastSeen = Date.now();
                        }
                    } catch(e) { console.error('Failed to parse progress report:', e); }
                    res.writeHead(200).end();
                });
            } else {
                res.writeHead(404).end('Not Found');
            }
        });
        
        server.listen(0, '0.0.0.0', () => {
            fileServer = server;
            downloadersUpdateInterval = setInterval(broadcastDownloadersUpdate, 2000); // More frequent updates
            const port = server.address().port;
            console.log(`File server started on port ${port}`);
            resolve(port);
        });
        server.on('error', reject);
    });
}

function stopFileServer() {
    if (downloadersUpdateInterval) {
        clearInterval(downloadersUpdateInterval);
        downloadersUpdateInterval = null;
    }
    activeDownloaders.clear();
    broadcastDownloadersUpdate();
    if (fileServer) {
        fileServer.close(() => {
            console.log('File server stopped.');
            fileServer = null;
        });
    }
}

// --- IPC HANDLERS ---

function handleToggleSharing() {
    ipcMain.handle('transfer:toggle-sharing', async (_, enable) => {
        try {
            if (enable) {
                const port = await startFileServer();
                lanIpc.setSharingState(true, port);
            } else {
                stopFileServer();
                lanIpc.setSharingState(false, null);
            }
            return { success: true };
        } catch (e) {
            console.error('Toggle sharing failed:', e);
            return { success: false, error: e.message };
        }
    });
}

function handleCancelDownload() {
    ipcMain.handle('transfer:cancel-download', () => {
        currentDownload.isCancelled = true;
        if (currentDownload.request) {
            currentDownload.request.destroy(); // Abort the current HTTP request
        }
        return { success: true };
    });
}

function handleDownloadGame() {
    ipcMain.handle('transfer:download-game', async (_, { host, playerName }) => {
        currentDownload = { isCancelled: false, request: null }; // Reset state
        try {
            // 0. Register as a downloader with the host
            await new Promise((resolve, reject) => {
                const req = http.request({
                    hostname: host.address, port: host.sharePort, path: '/register-downloader', method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }, res => res.statusCode === 200 ? resolve() : reject(new Error(`Host rejected registration: ${res.statusCode}`)));
                req.on('error', reject);
                req.write(JSON.stringify({ playerName, osUsername: OS_USERNAME }));
                req.end();
            });

            // 1. Get file list from host
            const fileListUrl = `http://${host.address}:${host.sharePort}/list-files`;
            const fileListResponse = await new Promise((resolve, reject) => {
                const req = http.get(fileListUrl, resolve);
                req.on('error', reject);
                currentDownload.request = req;
            });
            let fileListJson = '';
            for await (const chunk of fileListResponse) { fileListJson += chunk; }
            if (currentDownload.isCancelled) throw new Error('cancelled');
            const filesToDownload = JSON.parse(fileListJson);

            const totalSize = filesToDownload.filter(f => f.type === 'file').reduce((sum, f) => sum + f.size, 0);
            let downloadedSize = 0;
            let lastProgressTime = Date.now();
            let lastDownloadedSize = 0;

            // 2. Clear target directory using the same safe-list
            for (const item of GAME_ASSETS_TO_TRANSFER) {
                if (currentDownload.isCancelled) throw new Error('cancelled');
                const fullPath = path.join(CWD, item);
                if (fs.existsSync(fullPath)) {
                    try {
                        await fs.promises.rm(fullPath, { recursive: true, force: true });
                    } catch (e) {
                        if (e.code === 'EPERM' || e.code === 'EBUSY' || (e.message?.toLowerCase().includes('operation not permitted'))) {
                            throw new Error('requires-admin');
                        }
                        throw e;
                    }
                }
            }
            
            // 3. Download files
            for (let i = 0; i < filesToDownload.length; i++) {
                if (currentDownload.isCancelled) throw new Error('cancelled');
                const file = filesToDownload[i];
                const localPath = path.join(CWD, file.path);
                
                const progressPercentage = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;
                // Report progress to host
                const progressReq = http.request({
                    hostname: host.address, port: host.sharePort, path: '/report-progress', method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                progressReq.on('error', (e) => console.warn('Non-critical progress report failed:', e.message));
                progressReq.end(JSON.stringify({ progress: progressPercentage }));

                if (file.type === 'dir') {
                    try {
                        await fs.promises.mkdir(localPath, { recursive: true });
                    } catch(e) {
                        if (e.code === 'EPERM') throw new Error('requires-admin');
                        throw e;
                    }
                } else {
                    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
                    const fileStream = fs.createWriteStream(localPath);
                    const fileUrl = `http://${host.address}:${host.sharePort}/get-file?path=${encodeURIComponent(file.path)}`;
                    
                    await new Promise((resolve, reject) => {
                        const req = http.get(fileUrl, res => {
                            currentDownload.request = req;
                            res.on('data', chunk => {
                                if (currentDownload.isCancelled) {
                                    req.destroy();
                                    return;
                                }
                                downloadedSize += chunk.length;
                                const now = Date.now();
                                if (now - lastProgressTime > 250) { // Throttle updates
                                    const speed = (downloadedSize - lastDownloadedSize) / ((now - lastProgressTime) / 1000);
                                    lastProgressTime = now;
                                    lastDownloadedSize = downloadedSize;
                                    mainWindow?.webContents.send('transfer:progress', {
                                        totalSize, downloadedSize, totalFiles: filesToDownload.length, filesDone: i,
                                        currentFile: file.path, speed
                                    });
                                }
                            });
                            res.pipe(fileStream);
                            fileStream.on('finish', () => { currentDownload.request = null; resolve(); });
                            fileStream.on('error', (err) => {
                                if (err.code === 'EPERM') return reject(new Error('requires-admin'));
                                reject(err);
                            });
                        }).on('error', reject);
                    });
                }
            }
            
            http.request({ hostname: host.address, port: host.sharePort, path: '/report-progress', method: 'POST' }).end(JSON.stringify({ progress: 100 }));
            mainWindow?.webContents.send('transfer:complete', { success: true, type: 'full' });
            return { success: true };
        } catch (e) {
            const isUserCancel = currentDownload.isCancelled;
            const finalError = isUserCancel ? 'cancelled'
                             : (e.message === 'requires-admin' || e.code === 'EPERM' || e.code === 'EBUSY') ? 'requires-admin'
                             : e.message;

            const completeMessage = isUserCancel ? 'Download cancelled by user.' : finalError;
            mainWindow?.webContents.send('transfer:complete', { success: false, error: completeMessage });
            return { success: false, error: finalError };
        } finally {
            currentDownload = { isCancelled: false, request: null };
        }
    });
}

exports.init = (mw) => {
  mainWindow = mw;
  handleToggleSharing();
  handleDownloadGame();
  handleCancelDownload();
};

exports.shutdown = () => {
    stopFileServer();
};