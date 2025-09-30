const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { CWD } = require('../constants');
const lanIpc = require('./lan');

let mainWindow;
let fileServer = null;
let updateInfo = null;

// --- FILE SERVER HELPERS ---

async function listFilesRecursive(dir) {
    const exePath = app.getPath('exe');
    const fileList = [];
    
    async function walk(currentDir) {
        try {
            const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (fullPath.toLowerCase() === exePath.toLowerCase()) continue;

                const relativePath = path.relative(CWD, fullPath);
                if (entry.isDirectory()) {
                    fileList.push({ path: relativePath.replace(/\\/g, '/'), type: 'dir' });
                    await walk(fullPath);
                } else {
                    const stats = await fs.promises.stat(fullPath);
                    fileList.push({ path: relativePath.replace(/\\/g, '/'), size: stats.size, type: 'file' });
                }
            }
        } catch (e) {
            console.error(`Error walking directory ${currentDir}:`, e);
        }
    }
    
    await walk(dir);
    return fileList;
}

function startFileServer() {
    return new Promise((resolve, reject) => {
        if (fileServer) {
            return resolve(fileServer.address().port);
        }
        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url, `http://${req.headers.host}`);
            res.setHeader('Access-Control-Allow-Origin', '*');

            if (url.pathname === '/list-files') {
                try {
                    const files = await listFilesRecursive(CWD);
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
            const port = server.address().port;
            console.log(`File server started on port ${port}`);
            resolve(port);
        });
        server.on('error', reject);
    });
}

function stopFileServer() {
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
    ipcMain.handle('transfer:download-game', async (_, { host, type }) => {
        try {
            // 1. Get file list from host
            const fileListUrl = `http://${host.address}:${host.sharePort}/list-files`;
            const fileListResponse = await new Promise((resolve, reject) => http.get(fileListUrl, resolve).on('error', reject));
            let fileListJson = '';
            for await (const chunk of fileListResponse) { fileListJson += chunk; }
            const allFiles = JSON.parse(fileListJson);

            const filesToDownload = type === 'launcher' 
                ? allFiles.filter(f => f.path === 'LauncherFiles' || f.path.startsWith('LauncherFiles/') || path.basename(f.path) === '7d2dLauncher.exe')
                : allFiles;

            const totalSize = filesToDownload.filter(f => f.type === 'file').reduce((sum, f) => sum + f.size, 0);
            let downloadedSize = 0;
            let lastProgressTime = Date.now();
            let lastDownloadedSize = 0;

            // 2. Clear target directory
            const tempSuffix = '.7d2d-dl-new';
            if (type === 'full') {
                const entries = await fs.promises.readdir(CWD);
                const exePath = app.getPath('exe');
                for (const entry of entries) {
                    const fullPath = path.join(CWD, entry);
                    if (fullPath.toLowerCase() !== exePath.toLowerCase()) {
                        await fs.promises.rm(fullPath, { recursive: true, force: true });
                    }
                }
            }

            // 3. Download files
            for (let i = 0; i < filesToDownload.length; i++) {
                const file = filesToDownload[i];
                const localPath = path.join(CWD, type === 'launcher' ? file.path + tempSuffix : file.path);

                if (file.type === 'dir') {
                    await fs.promises.mkdir(localPath, { recursive: true });
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
                            fileStream.on('error', reject);
                        }).on('error', reject);
                    });
                }
            }

            // 4. Handle launcher update
            if (type === 'launcher') {
                const updateScriptPath = path.join(app.getPath('temp'), '7d2d-launcher-update.bat');
                const scriptContent = `
@echo off
echo Waiting for launcher to close...
timeout /t 2 /nobreak > NUL
echo Replacing files...
taskkill /IM "7d2dLauncher.exe" /F > NUL
move /y "${path.join(CWD, '7d2dLauncher.exe' + tempSuffix)}" "${path.join(CWD, '7d2dLauncher.exe')}"
rmdir /s /q "${path.join(CWD, 'LauncherFiles')}"
move /y "${path.join(CWD, 'LauncherFiles' + tempSuffix)}" "${path.join(CWD, 'LauncherFiles')}"
echo Relaunching...
start "" "${path.join(CWD, '7d2dLauncher.exe')}"
del "${updateScriptPath}"
`;
                fs.writeFileSync(updateScriptPath, scriptContent);
                updateInfo = { scriptPath: updateScriptPath };
            }

            mainWindow?.webContents.send('transfer:complete', { success: true, type });
            return { success: true };
        } catch (e) {
            console.error('Download failed:', e);
            mainWindow?.webContents.send('transfer:complete', { success: false, error: e.message });
            return { success: false, error: e.message };
        }
    });
}

function handleRestartForUpdate() {
    ipcMain.handle('transfer:restart-for-update', () => {
        if (updateInfo && updateInfo.scriptPath) {
            try {
                spawn('cmd.exe', ['/c', `start "" "${updateInfo.scriptPath}"`], { detached: true, stdio: 'ignore' }).unref();
                app.quit();
            } catch (e) {
                console.error('Failed to run update script:', e);
            }
        }
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