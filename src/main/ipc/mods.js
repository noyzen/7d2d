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
    parseAttributeValue: true,
    trimValues: true,
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
          
          // The root tag is usually <xml> or <ModInfo>. We get the content inside it.
          const modInfo = parsedData.xml || parsedData.ModInfo;

          if (!modInfo) {
            baseModInfo.description = 'ERROR: Could not find a valid root tag (<xml> or <ModInfo>).';
            return baseModInfo;
          }

          return {
            folderName: dirent.name,
            name: modInfo.DisplayName?.value || modInfo.Name?.value || dirent.name,
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
      if (!fs.existsSync(MODS_PATH)) await fs.promises.mkdir(MODS_PATH, { recursive: true });
      if (!fs.existsSync(DISABLED_MODS_PATH)) await fs.promises.mkdir(DISABLED_MODS_PATH, { recursive: true });
      
      const sourcePath = path.join(enable ? DISABLED_MODS_PATH : MODS_PATH, folderName);
      const destPath = path.join(enable ? MODS_PATH : DISABLED_MODS_PATH, folderName);

      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: `Source mod folder not found at ${sourcePath}` };
      }
      if (fs.existsSync(destPath)) {
        // This is an unexpected state where a mod with the same folder name exists in both directories.
        // Prevent overwrite to avoid data loss.
        return { success: false, error: `Destination conflict: a mod named '${folderName}' already exists.` };
      }
      
      await fs.promises.rename(sourcePath, destPath);
      return { success: true };
    } catch (e) {
      console.error('Failed to toggle mod:', e);
      return { success: false, error: e.message };
    }
  });
}

/**
 * Safely moves a directory, checking for existence and conflicts.
 * @param {string} source - The full path to the source directory.
 * @param {string} dest - The full path to the destination directory.
 * @param {string} modName - The name of the mod folder for error messages.
 */
async function safeMove(source, dest, modName) {
    if (!fs.existsSync(source)) {
        throw new Error(`Mod to move '${modName}' was not found in the source directory.`);
    }
    if (fs.existsSync(dest)) {
        throw new Error(`Cannot move mod '${modName}', a folder with the same name already exists in the destination.`);
    }
    await fs.promises.rename(source, dest);
}

function handleApplyModSet() {
    ipcMain.handle('mods:apply-mod-set', async (_, { modSetFolderNames }) => {
        try {
            if (!fs.existsSync(DISABLED_MODS_PATH)) await fs.promises.mkdir(DISABLED_MODS_PATH, { recursive: true });
            if (!fs.existsSync(MODS_PATH)) await fs.promises.mkdir(MODS_PATH, { recursive: true });
            
            const set = new Set(modSetFolderNames);
            const enabledDirs = fs.readdirSync(MODS_PATH, { withFileTypes: true }).filter(d => d.isDirectory());
            const disabledDirs = fs.readdirSync(DISABLED_MODS_PATH, { withFileTypes: true }).filter(d => d.isDirectory());
            
            // Using sequential operations for safety. If one fails, the loop stops immediately.
            
            // Disable mods that are currently enabled but shouldn't be
            for (const mod of enabledDirs) {
                if (!set.has(mod.name)) {
                    const sourcePath = path.join(MODS_PATH, mod.name);
                    const destPath = path.join(DISABLED_MODS_PATH, mod.name);
                    await safeMove(sourcePath, destPath, mod.name);
                }
            }

            // Enable mods that are currently disabled but should be
            for (const mod of disabledDirs) {
                if (set.has(mod.name)) {
                    const sourcePath = path.join(DISABLED_MODS_PATH, mod.name);
                    const destPath = path.join(MODS_PATH, mod.name);
                    await safeMove(sourcePath, destPath, mod.name);
                }
            }
            
            return { success: true };
        } catch (e) {
            console.error('Failed to apply mod set:', e);
            // The error message from safeMove is designed to be user-friendly.
            return { success: false, error: e.message };
        }
    });
}


exports.init = () => {
  handleGetMods();
  handleToggleMod();
  handleApplyModSet();
};