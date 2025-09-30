const { ipcMain, app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  LAUNCHER_FILES_PATH,
  SETTINGS_PATH,
  GAME_EXE_PATH,
  CWD,
} = require('../constants');
const lanIpc = require('./lan');

let mainWindow;
let gameProcess = null;

// --- IPC HANDLERS ---

function handleGetInitialData() {
  ipcMain.handle('launcher:get-initial-data', () => {
    if (!fs.existsSync(LAUNCHER_FILES_PATH)) {
      return { error: `Required folder 'LauncherFiles' not found.` };
    }
    const bgPath = path.join(LAUNCHER_FILES_PATH, 'bg.jpg');
    const bgmPath = path.join(LAUNCHER_FILES_PATH, 'bgm.mp3');
    if (!fs.existsSync(bgPath) || !fs.existsSync(bgmPath)) {
      return { error: `bg.jpg or bgm.mp3 not found inside 'LauncherFiles'.` };
    }

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

    return {
      success: true,
      bgPath: `file:///${bgPath.replace(/\\/g, '/')}`,
      bgmPath: `file:///${bgmPath.replace(/\\/g, '/')}`,
      settings
    };
  });
}

function handleSaveSettings() {
  ipcMain.handle('launcher:save-settings', async (_, settings) => {
    try {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
      if (settings.playerName && settings.playerName !== lanIpc.getCurrentUsername()) {
        lanIpc.setUsername(settings.playerName);
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
        await new Promise((resolve, reject) => {
            const regProcess = spawn('reg', ['add', rule.regPath, '/v', rule.keyName, '/d', newValue, '/f']);
            let stderr = '';
            regProcess.stderr.on('data', (data) => { stderr += data; });
            regProcess.on('close', (code) => code === 0 ? resolve() : reject(new Error(`reg command failed with code ${code}: ${stderr}`)));
            regProcess.on('error', (err) => reject(err));
        });
    }
}

function buildLaunchArgs(launchParameters) {
    const gameArgs = [];
    const LAUNCH_PARAM_TYPES = { 'AllowCrossplay': 'bool', 'AllowJoinConfigModded': 'bool', 'LoadSaveGame': 'bool', 'LocalizationChecks': 'bool', 'NoXInput': 'bool', 'SkipNewsScreen': 'bool', 'PlayerPrefsFile': 'bool', 'DebugNet': 'object', 'DebugPackages': 'object', 'ExportCustomAtlases': 'object', 'NoEAC': 'object', 'NoGameSense': 'object', 'NoLiteNetLib': 'object', 'NoRakNet': 'object', 'NoUNet': 'object', 'Quick-Continue': 'object', 'SkipIntro': 'object', 'DisableNativeInput': 'object', 'Submission': 'object', 'CrossPlatform': 'string', 'DebugAchievements': 'string', 'DebugEAC': 'string', 'DebugEOS': 'string', 'DebugInput': 'string', 'DebugSessions': 'string', 'DebugShapes': 'string', 'DebugXui': 'string', 'Language': 'string', 'LogFile': 'string', 'NewPrefabsMod': 'string', 'Platform': 'string', 'ServerPlatforms': 'string', 'SessionInvite': 'string', 'UserDataFolder': 'string', 'MapChunkDatabase': 'string', 'MaxWorldSizeClient': 'string', 'MaxWorldSizeHost': 'string', 'dedicated': 'flag' };
    if (!launchParameters) return gameArgs;
    
    for (const key in launchParameters) {
        const value = launchParameters[key];
        const type = LAUNCH_PARAM_TYPES[key];
        if (!type) continue;
        if ((type === 'bool') || (type === 'string' && value.trim() !== '')) {
            gameArgs.push(`-${key}=${String(value).trim()}`);
        } else if ((type === 'object' || type === 'flag') && value === true) {
            gameArgs.push(`-${key}`);
        }
    }
    return gameArgs;
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
      
          mainWindow?.minimize();
          
          child.on('exit', (code) => {
            console.log(`Game process exited with code ${code}`);
            gameProcess = null;
            if (mainWindow && !mainWindow.isDestroyed()) {
              if (mainWindow.isMinimized()) mainWindow.restore();
              mainWindow.focus();
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
};
