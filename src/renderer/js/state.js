export let settings = {
  playMusic: true,
  exitOnLaunch: false,
  playerName: 'Survivor',
  configEditorRules: [],
  registryEditorRules: [],
  launchParameters: {},
  aboutPage: {
    title: 'About This Launcher',
    creator: 'Your Name Here',
    version: '1.0.0',
    website: 'https://example.com',
    description: 'A custom launcher for 7 Days to Die.'
  }
};

export const LAUNCH_PARAMETERS_CONFIG = {
    'AllowCrossplay': { type: 'bool', description: 'Allow crossplay between platforms.' },
    'AllowJoinConfigModded': { type: 'bool', description: 'Allow joining modded servers.' },
    'LoadSaveGame': { type: 'bool', description: 'Load a specific save game on start.' },
    'LocalizationChecks': { type: 'bool', description: 'Enable localization checks.' },
    'NoXInput': { type: 'bool', description: 'Disable XInput support.' },
    'PlayerPrefsFile': { type: 'bool', description: 'Use a specific player preferences file.' },
    'SkipNewsScreen': { type: 'bool', description: 'Skip the news screen on startup.' },
    'DebugNet': { type: 'object', description: 'Enable network debugging.' },
    'DebugPackages': { type: 'object', description: 'Enable package debugging.' },
    'DisableNativeInput': { type: 'object', description: 'Disable native input handling.' },
    'ExportCustomAtlases': { type: 'object', description: 'Export custom atlases.' },
    'NoEAC': { type: 'object', description: 'Disable Easy Anti-Cheat.' },
    'NoGameSense': { type: 'object', description: 'Disable SteelSeries GameSense.' },
    'NoLiteNetLib': { type: 'object', description: 'Disable LiteNetLib networking.' },
    'NoRakNet': { type: 'object', description: 'Disable RakNet networking.' },
    'NoUNet': { type: 'object', description: 'Disable UNet networking.' },
    'Quick-Continue': { type: 'object', description: 'Quickly continue the last game.' },
    'SkipIntro': { type: 'object', description: 'Skip the intro video.' },
    'Submission': { type: 'object', description: 'Enable submission mode (no value).' },
    'dedicated': { type: 'flag', description: 'Run in dedicated server mode.' },
    'CrossPlatform': { type: 'string', description: 'Specify cross-platform service.' },
    'DebugAchievements': { type: 'string', description: 'Debug achievements (e.g., verbose).' },
    'DebugEAC': { type: 'string', description: 'Debug EAC (e.g., verbose).' },
    'DebugEOS': { type: 'string', description: 'Debug EOS (e.g., verbose).' },
    'DebugInput': { type: 'string', description: 'Debug input (e.g., verbose).' },
    'DebugSessions': { type: 'string', description: 'Debug sessions (e.g., verbose).' },
    'DebugShapes': { type: 'string', description: 'Debug shapes (e.g., verbose).' },
    'DebugXui': { type: 'string', description: 'Debug XUI (e.g., verbose).' },
    'Language': { type: 'string', description: 'Set the game language (e.g., "english").' },
    'LogFile': { type: 'string', description: 'Specify a custom log file name.' },
    'MapChunkDatabase': { type: 'string', description: 'Set map chunk database type.' },
    'MaxWorldSizeClient': { type: 'int', description: 'Max world size for clients.' },
    'MaxWorldSizeHost': { type: 'int', description: 'Max world size for hosts.' },
    'NewPrefabsMod': { type: 'string', description: 'Load prefabs from a specific mod.' },
    'Platform': { type: 'string', description: 'Force a specific platform.' },
    'ServerPlatforms': { type: 'string', description: 'Allowed server platforms.' },
    'SessionInvite': { type: 'string', description: 'Accept a session invite.' },
    'UserDataFolder': { type: 'string', description: 'Specify a custom user data folder.' },
};

export function saveSettings() {
  window.launcher.saveSettings(settings);
}

export function updateAndSaveSettings(newSettings) {
    settings = { ...settings, ...newSettings };
    saveSettings();
}

export function applyInitialSettings(loadedSettings) {
    if (loadedSettings) {
        settings = { ...settings, ...loadedSettings };
    }
    const bgm = document.getElementById('bgm');
    if (settings.playMusic) {
      bgm.play().catch(e => console.error("Audio playback failed:", e));
    } else {
      bgm.pause();
    }
}

// Ensures that settings from older versions of the launcher are compatible
// by adding default values for new features.
export function initDefaultSettings() {
    let changed = false;
    if (!settings.configEditorRules) {
        settings.configEditorRules = [{
            id: Date.now(),
            filePath: 'C:\\Path\\To\\Your\\Game\\steam_emu.ini',
            lineNumber: 29,
            lineTemplate: 'UserName=##7d2dlauncher-username##',
            lineMatch: 'UserName=' 
        }];
        changed = true;
    }
    if (window.appInfo.platform === 'win32' && !settings.registryEditorRules) {
        settings.registryEditorRules = [{
            id: Date.now() + 1,
            regPath: 'HKEY_CURRENT_USER\\SOFTWARE\\The Fun Pimps\\7 Days To Die',
            keyName: 'PlayerName_h775476977',
            keyValueTemplate: '##7d2dlauncher-username##'
        }];
        changed = true;
    }
    if (!settings.launchParameters) {
        settings.launchParameters = {};
        changed = true;
    }
    for (const key in LAUNCH_PARAMETERS_CONFIG) {
        if (settings.launchParameters[key] === undefined) {
          const config = LAUNCH_PARAMETERS_CONFIG[key];
          settings.launchParameters[key] = (config.type === 'bool' || config.type === 'object' || config.type === 'flag') ? false : '';
          changed = true;
        }
    }

    if (changed) {
        saveSettings();
    }
}
