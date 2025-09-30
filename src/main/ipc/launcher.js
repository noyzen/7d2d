const { ipcMain, app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, exec, execSync } = require('child_process');
const {
  LAUNCHER_FILES_PATH,
  SETTINGS_PATH,
  MOD_SETS_PATH,
  GAME_EXE_PATH,
  CWD,
} = require('../constants');
const lanIpc = require('./lan');
const transferIpc = require('./transfer');

let mainWindow;
let gameProcess = null;

// --- IPC HANDLERS ---

function handleGetGamePath() {
    ipcMain.handle('launcher:get-game-path', () => CWD);
}

function handleRelaunchAsAdmin() {
    ipcMain.handle('launcher:relaunch-as-admin', () => {
        if (process.platform === 'win32') {
            const exePath = app.getPath('exe');
            try {
                // Relaunching with 'runas' verb to trigger UAC prompt for elevation
                const child = spawn('cmd.exe', ['/c', 'start', '""', `"${exePath}"`], {
                    detached: true,
                    shell: true,
                    stdio: 'ignore',
                    windowsVerbatimArguments: true
                });
                child.unref();
                app.quit();
                return { success: true };
            } catch (e) {
                console.error('Failed to relaunch as admin:', e);
                return { success: false, error: e.message };
            }
        }
        return { success: false, error: 'Operation only supported on Windows.' };
    });
}


function handleGetInitialData() {
  ipcMain.handle('launcher:get-initial-data', () => {
    let settings = {};
    try {
      if (fs.existsSync(SETTINGS_PATH)) {
        settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        if (settings.playerName) {
          lanIpc.setUsername(settings.playerName);
        }
      }
      if (!settings.aboutPage) {
        settings.aboutPage = { title: 'About This Launcher', creator: 'Your Name Here', version: app.getVersion(), website: 'https://example.com', description: '...' };
      } else {
        settings.aboutPage.version = app.getVersion();
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }

    // Load mod sets separately
    try {
      if (fs.existsSync(MOD_SETS_PATH)) {
        settings.modSets = JSON.parse(fs.readFileSync(MOD_SETS_PATH, 'utf8'));
      } else if (settings.modSets && Array.isArray(settings.modSets)) {
        // Migration case: modSets are in the main settings file.
        // They will be moved to modsets.json on the next save operation.
        console.log('Migrating modSets from settings.json to modsets.json');
      } else {
        settings.modSets = [];
      }
    } catch (e) {
      console.error("Failed to load or migrate mod sets:", e);
      settings.modSets = [];
    }
    
    let bgPath = null;
    let bgmPaths = [];

    try {
      if (fs.existsSync(LAUNCHER_FILES_PATH)) {
        const files = fs.readdirSync(LAUNCHER_FILES_PATH);
        
        const bgFiles = files.filter(f => 
          f.toLowerCase().startsWith('bg') && 
          ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase())
        );
        if (bgFiles.length > 0) {
          const randomBg = bgFiles[Math.floor(Math.random() * bgFiles.length)];
          bgPath = path.join(LAUNCHER_FILES_PATH, randomBg);
        }

        const bgmFiles = files.filter(f => 
          ['.mp3', '.wav'].includes(path.extname(f).toLowerCase())
        );
        if (bgmFiles.length > 0) {
            bgmPaths = bgmFiles.map(f => path.join(LAUNCHER_FILES_PATH, f));
        }
      }
    } catch (e) {
      console.error("Error scanning for media files:", e);
    }

    let isElevated;
    if (process.platform === 'win32') {
      try {
        execSync(`fsutil dirty query ${process.env.systemdrive || 'C:'}`, { stdio: 'ignore' });
        isElevated = true;
      } catch (e) {
        isElevated = false;
      }
    } else {
      isElevated = (process.getuid() === 0);
    }

    return {
      success: true,
      bgPath: bgPath ? `file:///${bgPath.replace(/\\/g, '/')}` : null,
      bgmPaths: bgmPaths.map(p => `file:///${p.replace(/\\/g, '/')}`),
      settings,
      isElevated
    };
  });
}

function handleSaveSettings() {
  ipcMain.handle('launcher:save-settings', async (_, receivedSettings) => {
    try {
      // Ensure the directory exists before writing.
      if (!fs.existsSync(LAUNCHER_FILES_PATH)) {
        fs.mkdirSync(LAUNCHER_FILES_PATH, { recursive: true });
      }

      // Separate mod sets and save them to their own file.
      const modSets = receivedSettings.modSets || [];
      fs.writeFileSync(MOD_SETS_PATH, JSON.stringify(modSets, null, 2));

      // Create a copy of settings without modSets to save to the main file.
      const settingsToSave = { ...receivedSettings };
      delete settingsToSave.modSets;
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settingsToSave, null, 2));

      if (receivedSettings.playerName && receivedSettings.playerName !== lanIpc.getCurrentUsername()) {
        lanIpc.setUsername(receivedSettings.playerName);
      }
      return { success: true };
    } catch (e) {
      console.error("Failed to save settings:", e);
      return { success: false, error: e.message };
    }
  });
}

function handleSelectFile() {
    ipcMain.handle('launcher:select-file', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
          properties: ['openFile'],
          title: 'Select Configuration File'
        });
        if (!canceled && filePaths.length > 0) {
          return { success: true, filePath: filePaths[0] };
        }
        return { success: false };
    });
}

async function applyConfigEdits(playerName, configEditorRules) {
    if (!playerName || !configEditorRules || configEditorRules.length === 0) return;
    for (const rule of configEditorRules) {
        if (!rule.filePath || !rule.lineNumber || !rule.lineTemplate) continue;
        if (!fs.existsSync(rule.filePath)) throw new Error(`Config file not found: ${rule.filePath}`);

        const lines = fs.readFileSync(rule.filePath, 'utf8').split(/\r?\n/);
        const lineIndex = rule.lineNumber - 1;
        if (lineIndex < 0 || lineIndex >= lines.length) throw new Error(`Line number ${rule.lineNumber} is out of bounds for file ${rule.filePath}`);

        if (rule.lineMatch && !lines[lineIndex].includes(rule.lineMatch)) {
            throw new Error(`Validation failed for ${path.basename(rule.filePath)}: Line ${rule.lineNumber} does not contain "${rule.lineMatch}".`);
        }
        lines[lineIndex] = rule.lineTemplate.replace(/##7d2dlauncher-username##/g, playerName);
        fs.writeFileSync(rule.filePath, lines.join('\n'), 'utf8');
    }
}

async function applyRegistryEdits(playerName, registryEditorRules) {
    if (process.platform !== 'win32' || !playerName || !registryEditorRules || registryEditorRules.length === 0) return;
    for (const rule of registryEditorRules) {
        if (!rule.regPath || !rule.keyName || !rule.keyValueTemplate) continue;
        const newValue = rule.keyValueTemplate.replace(/##7d2dlauncher-username##/g, playerName);

        // Using exec to ensure the command is run within a shell, which can resolve certain environment/permission subtleties.
        // It's also more explicit about quoting arguments, which is what the 'reg' command-line tool expects.
        const command = `reg add "${rule.regPath}" /v "${rule.keyName}" /d "${newValue}" /f`;

        await new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Registry update failed. Error: ${error.message}. Stderr: ${stderr}`));
                }
                // The 'reg' command can sometimes write warnings to stderr. Check for common error strings.
                if (stderr && (stderr.toLowerCase().includes('error:') || stderr.toLowerCase().includes('access is denied'))) {
                    return reject(new Error(`Registry update failed with stderr: ${stderr}`));
                }
                resolve(stdout);
            });
        });
    }
}

function buildLaunchArgs(launchParameters) {
    const gameArgs = [];
    // This list should be kept in sync with the frontend state definition.
    const LAUNCH_PARAM_TYPES = {
        'AllowCrossplay': 'bool',
        'AllowJoinConfigModded': 'bool',
        'LoadSaveGame': 'bool',
        'LocalizationChecks': 'bool',
        'NoXInput': 'bool',
        'PlayerPrefsFile': 'bool',
        'SkipNewsScreen': 'bool',
        'DebugNet': 'object',
        'DebugPackages': 'object',
        'ExportCustomAtlases': 'object',
        'NoEAC': 'object',
        'NoGameSense': 'object',
        'NoLiteNetLib': 'object',
        'NoRakNet': 'object',
        'NoUNet': 'object',
        'Quick-Continue': 'object',
        'SkipIntro': 'object',
        'DisableNativeInput': 'object',
        'Submission': 'object',
        'CrossPlatform': 'string',
        'DebugAchievements': 'string',
        'DebugEAC': 'string',
        'DebugEOS': 'string',
        'DebugInput': 'string',
        'DebugSessions': 'string',
        'DebugShapes': 'string',
        'DebugXui': 'string',
        'Language': 'string',
        'LogFile': 'string',
        'NewPrefabsMod': 'string',
        'Platform': 'string',
        'ServerPlatforms': 'string',
        'SessionInvite': 'string',
        'UserDataFolder': 'string',
        'MapChunkDatabase': 'string',
        'MaxWorldSizeClient': 'int',
        'MaxWorldSizeHost': 'int',
        'dedicated': 'flag'
    };
    if (!launchParameters) return gameArgs;
    
    for (const key in launchParameters) {
        const value = launchParameters[key];
        const type = LAUNCH_PARAM_TYPES[key];

        // Skip if param is not in our list, or if it's disabled/empty
        if (!type || value === false || value === '') continue;

        const paramName = key.toLowerCase();

        if (type === 'bool' || type === 'string' || type === 'int') {
            if (String(value).trim() !== '') {
                gameArgs.push(`-${paramName}=${String(value).trim()}`);
            }
        } else if ((type === 'object' || type === 'flag') && value === true) {
            gameArgs.push(`-${paramName}`);
        }
    }
    return gameArgs;
}

function handleGetFirewallStatus() {
    ipcMain.handle('launcher:get-firewall-status', () => {
        return new Promise((resolve) => {
            if (process.platform !== 'win32') {
                return resolve({ status: 'UNSUPPORTED' });
            }
            // Use PowerShell for a more robust, non-localized check.
            const command = 'powershell.exe -Command "Get-NetFirewallProfile -Name Private | Select-Object -ExpandProperty Enabled"';
            exec(command, (error, stdout, stderr) => {
                if (error || stderr) {
                    console.error('Firewall check via PowerShell failed:', error || stderr);
                    return resolve({ status: 'ERROR', message: error ? error.message : stderr });
                }
                const result = stdout.trim().toLowerCase();
                if (result === 'true') {
                    return resolve({ status: 'ON' });
                } else if (result === 'false') {
                    return resolve({ status: 'OFF' });
                }
                resolve({ status: 'UNKNOWN' });
            });
        });
    });
}

function handleStartGame() {
    ipcMain.handle('launcher:start-game', async (_, settings) => {
        if (gameProcess) return { error: 'Game is already running.' };
        if (!fs.existsSync(GAME_EXE_PATH)) return { error: `7DaysToDie.exe not found!` };
      
        try {
          await applyConfigEdits(settings.playerName, settings.configEditorRules);
          await applyRegistryEdits(settings.playerName, settings.registryEditorRules);
      
          const gameArgs = buildLaunchArgs(settings.launchParameters);
          const child = spawn(GAME_EXE_PATH, gameArgs, { detached: true, stdio: 'ignore', cwd: CWD });
          child.unref();
          gameProcess = child;
      
          if (settings.exitOnLaunch) {
            setTimeout(() => app.quit(), 500);
            return { success: true, action: 'quitting' };
          }
      
          // Pause background tasks to reduce resource usage while game is running
          lanIpc.pause();
          transferIpc.pause();

          mainWindow?.minimize();
          
          child.on('exit', (code) => {
            console.log(`Game process exited with code ${code}`);
            gameProcess = null;
            if (mainWindow && !mainWindow.isDestroyed()) {
              if (mainWindow.isMinimized()) mainWindow.restore();
              mainWindow.focus();

              // Resume background tasks
              lanIpc.resume();
              transferIpc.resume();
              
              mainWindow.webContents.send('game:closed');
            }
          });
      
          return { success: true, action: 'minimized' };
        } catch (e) {
          console.error("Failed during game launch prep:", e);
          gameProcess = null;
          return { error: e.message };
        }
    });
}

exports.init = (mw) => {
  mainWindow = mw;
  handleGetInitialData();
  handleSaveSettings();
  handleStartGame();
  handleSelectFile();
  handleGetFirewallStatus();
  handleGetGamePath();
  handleRelaunchAsAdmin();
};