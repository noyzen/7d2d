# 7 Days to Die Launcher

A feature-rich, cross-platform game launcher for 7 Days to Die, built with Electron. This launcher is designed to enhance the single-player and LAN party experience by providing a custom user interface for managing mods, game data, settings, and launching the game with advanced options.

![Launcher Screenshot](https://i.imgur.com/example.png) <!-- Placeholder for a screenshot -->

---

## ✨ Features

This launcher is packed with features designed for convenience and power-users.

### Core Launcher
- **Launch Game**: Simple one-click game launch.
- **Player Name Customization**: Set your in-game player name directly from the launcher, which can dynamically patch necessary game files and registry keys on launch.
- **Exit on Launch**: Option to automatically close the launcher to save system resources once the game is running.
- **Desktop Shortcut**: Automatically creates and maintains a desktop shortcut on Windows for easy access.

###  Mod Management
- **Smart Mod Detection**: Automatically detects all mods placed in the `Mods` folder.
- **Enable/Disable Mods**: Toggle mods on or off with a single click. The launcher handles the renaming of `ModInfo.xml` files.
- **Mod Sets**: Save your current selection of enabled mods as a named "set". Quickly switch between different mod configurations (e.g., "Vanilla+", "Overhaul Mods", "QoL Mods") without manually toggling each one.
- **Search & Filter**: Instantly search through your mods by name, author, or description.
- **Apply & Revert**: Quickly enable all mods in a set, or disable all mods at once.

### LAN & Multiplayer
- **Player Auto-Discovery**: Automatically discovers other users running the launcher on your local network.
- **LAN Chat**: A built-in, real-time chat client to communicate with other players on the LAN. Chat history is saved between sessions.
- **Full Game Transfer**:
    - **Host**: Enable "Game Sharing" to allow other LAN users to download your complete game installation. A dashboard shows you who is currently downloading from you.
    - **Client**: If a host is sharing, a download button appears. You can download the entire game from them, perfect for LAN parties to ensure everyone has the same version and files.

### Data & Save Management
- **Game Data Backup**: Create a full backup of your game's save data (worlds, player profiles located in `%APPDATA%/7DaysToDie`).
- **Game Data Restore**: Restore your saved data from a backup with one click.
- **Registry Backup/Restore**: (Windows Only) Backup and restore the game's registry keys, which often store player names and other settings.

###  Developer Tools (Advanced)
> **Unlock**: Click the "7D2D" logo in the top-left corner 7 times to reveal the "Developer" tab.
- **Dynamic Config File Editor**: Create rules to modify specific lines in any text-based file (e.g., `steam_emu.ini`) with your player name every time you launch the game.
- **Dynamic Registry Editor**: (Windows Only) Create rules to modify specific registry keys with your player name on launch.
- **Launch Parameters**: A comprehensive UI to configure all available command-line launch arguments for the game, from disabling EAC to setting a specific language.
- **"About Page" Editor**: Customize the content displayed on the launcher's "About" page.

### User Interface
- **Modern UI**: A clean, dark-themed UI with "glassmorphism" effects.
- **Responsive Design**: The interface adapts to different window sizes.
- **Background Music Player**: An integrated music player that plays tracks from the `LauncherFiles` folder. Includes a playlist, controls, and an audio visualizer.

---

## 💾 Installation

For most users, the easiest way to get started is to download a pre-built version from the project's **Releases** page.
- **Windows**: Download the `...portable.exe`. No installation is required.
- **Linux**: Download the `...AppImage`. Make it executable (`chmod +x *.AppImage`) and run it.

Place the downloaded executable in your `7 Days to Die` game folder, alongside `7DaysToDie.exe`.

---

## 🚀 Usage Guide

1.  **Placement**: Ensure the launcher executable is in the root of your game directory.
2.  **Mods**: Place your mods into the `Mods` folder.
3.  **Player Name**: If you have developer tools enabled and configured, your player name can be set on the Home screen.
4.  **LAN Features**: To use chat or file transfer, other players must be on the same local network and running the launcher.
5.  **Launch**: Click "Start Game"!

---

## 📂 File Structure (User-Facing)

The launcher creates and uses the following folders within your game directory:
- `LauncherFiles/`: Contains all launcher settings (`settings.json`), mod sets (`modsets.json`), chat history (`chathistory.json`), and any background music files (`.mp3`, `.wav`).
- `BackupData/`: Stores your game data and registry backups.
- `Mods/`: The required location for all your mods. The launcher manages enabling/disabling them within this folder.

---

## 💻 For Developers

### Setup
To get started with the development environment, clone the repository and install the dependencies.
```bash
# Install dependencies
npm install
```

### Scripts
- `npm run electron:dev` — Run the app in development mode with DevTools enabled.
- `npm run electron:build` — Build the application for production (AppImage for Linux, Portable for Windows).
