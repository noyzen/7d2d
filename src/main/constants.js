const { app } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

let CWD;
if (app.isPackaged) {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    CWD = process.env.PORTABLE_EXECUTABLE_DIR;
  } else {
    CWD = path.dirname(app.getPath('exe'));
  }
} else {
  CWD = process.cwd();
}

// Paths
const LAUNCHER_FILES_PATH = path.join(CWD, 'LauncherFiles');
const SETTINGS_PATH = path.join(LAUNCHER_FILES_PATH, 'settings.json');
const MODS_PATH = path.join(CWD, 'Mods');
const DISABLED_MODS_PATH = path.join(CWD, 'DisabledMods');
const GAME_EXE_PATH = path.join(CWD, '7DaysToDie.exe');
const SOURCE_DATA_PATH = path.join(app.getPath('appData'), '7DaysToDie');
const BACKUP_DATA_PATH = path.join(CWD, 'BackupData');
const REGISTRY_BACKUP_FILENAME = 'registry_backup.reg';
const REGISTRY_BACKUP_PATH = path.join(BACKUP_DATA_PATH, REGISTRY_BACKUP_FILENAME);
const REGISTRY_KEY_PATH = 'HKEY_CURRENT_USER\\SOFTWARE\\The Fun Pimps\\7 Days To Die';

// LAN Chat Constants
const LAN_PORT = 47625;
const BROADCAST_ADDR = '255.255.255.255';
const BROADCAST_INTERVAL = 5000;
const PEER_TIMEOUT = 12000;
const INSTANCE_ID = crypto.randomUUID();
const OS_USERNAME = os.userInfo().username;

module.exports = {
  CWD,
  LAUNCHER_FILES_PATH,
  SETTINGS_PATH,
  MODS_PATH,
  DISABLED_MODS_PATH,
  GAME_EXE_PATH,
  SOURCE_DATA_PATH,
  BACKUP_DATA_PATH,
  REGISTRY_BACKUP_PATH,
  REGISTRY_KEY_PATH,
  LAN_PORT,
  BROADCAST_ADDR,
  BROADCAST_INTERVAL,
  PEER_TIMEOUT,
  INSTANCE_ID,
  OS_USERNAME,
};
