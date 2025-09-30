const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { MODS_PATH, DISABLED_MODS_PATH } = require('../constants');

// --- HELPERS ---

const readModsFromDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) return [];
  const parser = new XMLParser();
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => {
      const xmlPath = path.join(dirPath, dirent.name, 'ModInfo.xml');
      if (fs.existsSync(xmlPath)) {
        try {
          const modInfo = parser.parse(fs.readFileSync(xmlPath, 'utf8')).xml;
          return {
            folderName: dirent.name,
            name: modInfo.DisplayName?.['@_value'] || modInfo.Name?.['@_value'] || dirent.name,
            description: modInfo.Description?.['@_value'] || 'No description.',
            author: modInfo.Author?.['@_value'] || 'Unknown author.',
            version: modInfo.Version?.['@_value'] || 'N/A',
          };
        } catch (e) {
          console.error(`Error parsing ${xmlPath}:`, e);
          return { folderName: dirent.name, name: dirent.name, error: 'Could not parse ModInfo.xml' };
        }
      }
      return null;
    })
    .filter(Boolean);
};

// --- IPC HANDLERS ---

function handleGetMods() {
  ipcMain.handle('mods:get', () => {
    return {
      enabled: readModsFromDir(MODS_PATH),
      disabled: readModsFromDir(DISABLED_MODS_PATH),
    };
  });
}

function handleToggleMod() {
  ipcMain.handle('mods:toggle', (_, { folderName, enable }) => {
    try {
      if (!fs.existsSync(DISABLED_MODS_PATH)) {
        fs.mkdirSync(DISABLED_MODS_PATH);
      }
      const sourcePath = path.join(enable ? DISABLED_MODS_PATH : MODS_PATH, folderName);
      const destPath = path.join(enable ? MODS_PATH : DISABLED_MODS_PATH, folderName);
      if (fs.existsSync(sourcePath)) {
        fs.renameSync(sourcePath, destPath);
        return { success: true };
      }
      return { success: false, error: 'Source mod folder not found.' };
    } catch (e) {
      console.error('Failed to toggle mod:', e);
      return { success: false, error: e.message };
    }
  });
}

exports.init = () => {
  handleGetMods();
  handleToggleMod();
};
