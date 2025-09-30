const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { CWD } = require('../constants');
const lanIpc = require('./lan');

let mainWindow;
let fileServer = null;
const activeDownloads = new Map();
let downloadMonitorInterval = null;

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

// --- FILE SERVER HELPERS ---

function monitorDownloads() {
    const now = Date.now();
    let changed = false;
    for (const [ip, data] of activeDownloads.entries()) {
        if (now - data.lastSeen > 10000) { // 10 second timeout
            activeDownloads.delete(ip);
            changed = true;
        }
    }
    if (changed || downloadMonitorInterval) { // Send initial update
        const downloaders = Array.from(activeDownloads.keys());
        mainWindow?.webContents.send('transfer:active-downloads-update', downloaders);
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
            if (ip) {
                activeDownloads.set(ip, { lastSeen: Date.now() });
                monitorDownloads();
            }

            const url = new URL(req.url, `http://${req.headers.host}`);
            res.setHeader('Access-Control-Allow-Origin', '*');

            if (url.pathname === '/list-files') {
                try {
                    const files = await listAllowedFiles();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(files));
                } catch (e) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: e.message }));
                }
            } else if (url.pathname === '/get-file') {
                try {
                    const filePath = url.searchParams.get('path');
                    if (!filePath) throw new Error('File path is required.');
                    
                    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
                    const fullPath = path.join(CWD, safePath);

                    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
                        res.writeHead(404);
                        res.end('File not found.');
                        return;
                    }

                    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
                    fs.createReadStream(fullPath).pipe(res);
                } catch (e) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: e.message }));
                }
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });
        
        server.listen(0, '0.0.0.0', () => { // Listen on port 0 to get a random free port
            fileServer = server;
            downloadMonitorInterval = setInterval(monitorDownloads, 5000);
            const port = server.address().port;
            console.log(`File server started on port ${port}`);
            resolve(port);
        });
        server.on('error', reject);
    });
}

function stopFileServer() {
    if (downloadMonitorInterval) {
        clearInterval(downloadMonitorInterval);
        downloadMonitorInterval = null;
    }
    activeDownloads.clear();
    monitorDownloads(); // Send one last empty update
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

function handleDownloadGame() {
    ipcMain.handle('transfer:download-game', async (_, { host }) => {
        try {
            // 1. Get file list from host (this list is guaranteed to be safe)
            const fileListUrl = `http://${host.address}:${host.sharePort}/list-files`;
            const fileListResponse = await new Promise((resolve, reject) => http.get(fileListUrl, resolve).on('error', reject));
            let fileListJson = '';
            for await (const chunk of fileListResponse) { fileListJson += chunk; }
            const filesToDownload = JSON.parse(fileListJson);

            const totalSize = filesToDownload.filter(f => f.type === 'file').reduce((sum, f) => sum + f.size, 0);
            let downloadedSize = 0;
            let lastProgressTime = Date.now();
            let lastDownloadedSize = 0;

            // 2. Clear target directory using the same safe-list
            for (const item of GAME_ASSETS_TO_TRANSFER) {
                const fullPath = path.join(CWD, item);
                if (fs.existsSync(fullPath)) {
                    try {
                        await fs.promises.rm(fullPath, { recursive: true, force: true });
                    } catch (e) {
                        console.warn(`Could not delete item during cleanup (might be locked): ${fullPath}`, e.message);
                        if (e.code === 'EPERM' || e.code === 'EBUSY' || (e.message && e.message.toLowerCase().includes('operation not permitted'))) {
                            throw new Error('requires-admin');
                        }
                        throw e; // Re-throw other errors
                    }
                }
            }
            
            // 3. Download files
            for (let i = 0; i < filesToDownload.length; i++) {
                const file = filesToDownload[i];
                const localPath = path.join(CWD, file.path);

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
                        http.get(fileUrl, res => {
                            res.on('data', chunk => {
                                downloadedSize += chunk.length;
                                const now = Date.now();
                                if (now - lastProgressTime > 250) { // Update speed ~4 times/sec
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
                            fileStream.on('finish', resolve);
                            fileStream.on('error', (err) => {
                                if (err.code === 'EPERM') return reject(new Error('requires-admin'));
                                reject(err);
                            });
                        }).on('error', reject);
                    });
                }
            }

            mainWindow?.webContents.send('transfer:complete', { success: true, type: 'full' });
            return { success: true };
        } catch (e) {
            console.error('Download failed:', e);
            const isPermissionError = e.code === 'EPERM' || e.code === 'EBUSY' || (e.message && (e.message.toLowerCase().includes('permission') || e.message.toLowerCase().includes('access is denied')));
            const finalError = e.message === 'requires-admin' || isPermissionError ? 'requires-admin' : e.message;
            mainWindow?.webContents.send('transfer:complete', { success: false, error: finalError });
            return { success: false, error: finalError };
        }
    });
}

function handleRestartForUpdate() {
    ipcMain.handle('transfer:restart-for-update', () => {
        // This is now obsolete as launcher self-update is removed, but kept for API consistency.
    });
}

exports.init = (mw) => {
  mainWindow = mw;
  handleToggleSharing();
  handleDownloadGame();
  handleRestartForUpdate();
};

exports.shutdown = () => {
    stopFileServer();
};
