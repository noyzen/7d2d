const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { SOURCE_DATA_PATH, BACKUP_DATA_PATH, CWD, REGISTRY_BACKUP_PATH, REGISTRY_KEY_PATH } = require('../constants');

let mainWindow;

// --- HELPERS ---

async function getFolderSize(folderPath) {
  let totalSize = 0;
  let fileCount = 0;
  try {
    if (!fs.existsSync(folderPath)) {
      return { totalSize: 0, fileCount: 0, mtime: null };
    }
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        const subFolderInfo = await getFolderSize(fullPath);
        totalSize += subFolderInfo.totalSize;
        fileCount += subFolderInfo.fileCount;
      } else {
        const stats = await fs.promises.stat(fullPath);
        totalSize += stats.size;
        fileCount++;
      }
    }
    const folderStat = await fs.promises.stat(folderPath);
    return { totalSize, fileCount, mtime: folderStat.mtime };
  } catch (e) {
    console.error(`Error getting size for ${folderPath}:`, e);
    return { totalSize: 0, fileCount: 0, mtime: null };
  }
}

function getDriveFreeSpace(drivePath) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows 
      ? `wmic logicaldisk where "DeviceID='${path.parse(drivePath).root.substring(0, 2)}'" get FreeSpace /value`
      : `df -kP "${drivePath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) return reject(error);
      if (stderr) return reject(new Error(stderr));
      
      if (isWindows) {
        const match = stdout.match(/FreeSpace=(\d+)/);
        resolve(match ? parseInt(match[1], 10) : 0);
      } else {
        const lines = stdout.trim().split('\n');
        const parts = lines[lines.length - 1].split(/\s+/);
        const availableKB = parseInt(parts[3], 10);
        resolve(availableKB * 1024);
      }
    });
  });
}

async function copyFolderRecursive(source, target, progressCallback) {
  const { totalSize, fileCount } = await getFolderSize(source);
  let copiedSize = 0;
  let filesCopied = 0;

  async function copy(src, dest) {
    const entries = await fs.promises.readdir(src, { withFileTypes: true });
    await fs.promises.mkdir(dest, { recursive: true });

    for (let entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copy(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
        const stats = await fs.promises.stat(srcPath);
        copiedSize += stats.size;
        filesCopied++;
        progressCallback({ totalSize, copiedSize, fileCount, filesCopied, currentFile: entry.name });
      }
    }
  }
  await copy(source, target);
}

function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) return reject(error);
            if (stderr) {
                const errorKeywords = ['ERROR:', 'Access is denied'];
                if (errorKeywords.some(keyword => stderr.includes(keyword))) {
                    return reject(new Error(stderr));
                }
            }
            resolve(stdout);
        });
    });
}

// --- IPC HANDLERS ---

function handleGetStatus() {
  ipcMain.handle('backup:get-status', async () => {
    try {
      const sourceInfo = await getFolderSize(SOURCE_DATA_PATH);
      const backupInfo = await getFolderSize(BACKUP_DATA_PATH);
      const freeSpace = await getDriveFreeSpace(CWD);
      const registryBackupExists = fs.existsSync(REGISTRY_BACKUP_PATH);

      return { success: true, source: sourceInfo, backup: backupInfo, freeSpace, registryBackupExists };
    } catch (e) {
      console.error('Failed to get backup status:', e);
      return { success: false, error: e.message };
    }
  });
}

function handleStartBackup() {
  ipcMain.handle('backup:start-backup', async () => {
    try {
      const sourceInfo = await getFolderSize(SOURCE_DATA_PATH);
      if (sourceInfo.totalSize === 0) throw new Error("Source game data folder is empty or not found.");

      const freeSpace = await getDriveFreeSpace(CWD);
      if (freeSpace < sourceInfo.totalSize) throw new Error("Not enough free disk space for backup.");
      
      if (fs.existsSync(BACKUP_DATA_PATH)) {
        await fs.promises.rm(BACKUP_DATA_PATH, { recursive: true, force: true });
      }
      await fs.promises.mkdir(BACKUP_DATA_PATH, { recursive: true });

      await copyFolderRecursive(SOURCE_DATA_PATH, BACKUP_DATA_PATH, (progress) => {
        mainWindow?.webContents.send('backup:progress', progress);
      });

      return { success: true };
    } catch (e) {
      console.error('Backup failed:', e);
      return { success: false, error: e.message };
    }
  });
}

function handleStartRestore() {
  ipcMain.handle('backup:start-restore', async () => {
      try {
          const backupInfo = await getFolderSize(BACKUP_DATA_PATH);
          if (backupInfo.totalSize === 0) throw new Error("Backup folder is empty or not found. Cannot restore.");

          if (fs.existsSync(SOURCE_DATA_PATH)) {
              await fs.promises.rm(SOURCE_DATA_PATH, { recursive: true, force: true });
          }
          await fs.promises.mkdir(SOURCE_DATA_PATH, { recursive: true });

          await copyFolderRecursive(BACKUP_DATA_PATH, SOURCE_DATA_PATH, (progress) => {
              mainWindow?.webContents.send('backup:progress', progress);
          });

          return { success: true };
      } catch (e) {
          console.error('Restore failed:', e);
          return { success: false, error: e.message };
      }
  });
}

function handleRegistryBackup() {
    ipcMain.handle('backup:start-registry-backup', async () => {
        if (process.platform !== 'win32') {
            return { success: false, error: 'Registry operations are only supported on Windows.' };
        }
        try {
            if (!fs.existsSync(BACKUP_DATA_PATH)) {
                await fs.promises.mkdir(BACKUP_DATA_PATH, { recursive: true });
            }
            const command = `reg export "${REGISTRY_KEY_PATH}" "${REGISTRY_BACKUP_PATH}" /y`;
            await executeCommand(command);
            return { success: true };
        } catch (e) {
            console.error('Registry backup failed:', e);
            return { success: false, error: e.message };
        }
    });
}

function handleRegistryRestore() {
    ipcMain.handle('backup:start-registry-restore', async () => {
        if (process.platform !== 'win32') {
            return { success: false, error: 'Registry operations are only supported on Windows.' };
        }
        try {
            if (!fs.existsSync(REGISTRY_BACKUP_PATH)) {
                throw new Error('Registry backup file not found. Cannot restore.');
            }
            const command = `reg import "${REGISTRY_BACKUP_PATH}"`;
            await executeCommand(command);
            return { success: true };
        } catch (e) {
            console.error('Registry restore failed:', e);
            return { success: false, error: e.message };
        }
    });
}

exports.init = (mw) => {
  mainWindow = mw;
  handleGetStatus();
  handleStartBackup();
  handleStartRestore();
  handleRegistryBackup();
  handleRegistryRestore();
};
