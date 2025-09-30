const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { MODS_PATH, DISABLED_MODS_PATH } = require('../constants');

// --- HELPERS ---

const readModsFromDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) return [];
  // Options to ensure attributes are parsed correctly.
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: true
  });

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => {
      const xmlPath = path.join(dirPath, dirent.name, 'ModInfo.xml');
      const baseModInfo = {
        folderName: dirent.name,
        name: dirent.name,
        description: 'No description.',
        author: 'Unknown author.',
        version: 'N/A',
        isValid: false
      };

      if (fs.existsSync(xmlPath)) {
        try {
          const xmlContent = fs.readFileSync(xmlPath, 'utf8');
          const parsedData = parser.parse(xmlContent);
          const modInfo = parsedData.xml?.ModInfo || parsedData.ModInfo;

          if (!modInfo) {
            baseModInfo.description = 'ERROR: Could not find <xml> or <ModInfo> root tag.';
            return baseModInfo;
          }

          return {
            folderName: dirent.name,
            name: modInfo.Name?.value || dirent.name,
            description: modInfo.Description?.value || 'No description.',
            author: modInfo.Author?.value || 'Unknown author.',
            version: modInfo.Version?.value || 'N/A',
            isValid: true,
          };
        } catch (e) {
          console.error(`Error parsing ${xmlPath}:`, e);
          baseModInfo.description = `ERROR: Could not parse ModInfo.xml. Details: ${e.message}`;
          return baseModInfo;
        }
      } else {
        baseModInfo.description = 'ERROR: ModInfo.xml not found in this folder.';
        return baseModInfo;
      }
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
  ipcMain.handle('mods:toggle', async (_, { folderName, enable }) => {
    try {
      if (!fs.existsSync(DISABLED_MODS_PATH)) {
        await fs.promises.mkdir(DISABLED_MODS_PATH);
      }
      const sourcePath = path.join(enable ? DISABLED_MODS_PATH : MODS_PATH, folderName);
      const destPath = path.join(enable ? MODS_PATH : DISABLED_MODS_PATH, folderName);
      if (fs.existsSync(sourcePath)) {
        await fs.promises.rename(sourcePath, destPath);
        return { success: true };
      }
      return { success: false, error: 'Source mod folder not found.' };
    } catch (e) {
      console.error('Failed to toggle mod:', e);
      return { success: false, error: e.message };
    }
  });
}

function handleApplyModSet() {
    ipcMain.handle('mods:apply-mod-set', async (_, { modSetFolderNames }) => {
        try {
            if (!fs.existsSync(DISABLED_MODS_PATH)) {
                await fs.promises.mkdir(DISABLED_MODS_PATH, { recursive: true });
            }
            if (!fs.existsSync(MODS_PATH)) {
                await fs.promises.mkdir(MODS_PATH, { recursive: true });
            }
            
            const set = new Set(modSetFolderNames);
            const allMods = [
                ...fs.readdirSync(MODS_PATH, { withFileTypes: true }).filter(d => d.isDirectory()),
                ...fs.readdirSync(DISABLED_MODS_PATH, { withFileTypes: true }).filter(d => d.isDirectory())
            ];
            
            for (const mod of allMods) {
                const shouldBeEnabled = set.has(mod.name);
                const isCurrentlyEnabled = fs.existsSync(path.join(MODS_PATH, mod.name));

                if (shouldBeEnabled && !isCurrentlyEnabled) {
                    // Enable it: Move from Disabled to Enabled
                    await fs.promises.rename(path.join(DISABLED_MODS_PATH, mod.name), path.join(MODS_PATH, mod.name));
                } else if (!shouldBeEnabled && isCurrentlyEnabled) {
                    // Disable it: Move from Enabled to Disabled
                    await fs.promises.rename(path.join(MODS_PATH, mod.name), path.join(DISABLED_MODS_PATH, mod.name));
                }
            }
            return { success: true };
        } catch (e) {
            console.error('Failed to apply mod set:', e);
            return { success: false, error: e.message };
        }
    });
}


exports.init = () => {
  handleGetMods();
  handleToggleMod();
  handleApplyModSet();
};