// Naprawia blad "EMFILE: too many open files" na Windows, ktory pojawia sie
// przy pobieraniu tysiecy malych plikow assetow Minecrafta naraz. Musi byc
// zaladowane jako pierwsze, zanim jakikolwiek inny kod uzyje modulu 'fs'.
require('graceful-fs').gracefulify(require('fs'));

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const dataDir = app.getPath('userData');
const settingsFile = path.join(dataDir, 'settings.json');
const instancesFile = path.join(dataDir, 'instances.json');
const accountFile = path.join(dataDir, 'account.json');

// W wersji portable Electron/electron-builder rozpakowuje aplikacje do
// tymczasowego folderu w Temp - sciezki WZGLEDEM aplikacji (np. "./instances")
// laduja wiec w Temp i znikaja / czasem nie da sie tam nawet zapisac.
// Dlatego instancje trzymamy zawsze w stalym, przewidywalnym miejscu:
// - PORTABLE_EXECUTABLE_DIR (ustawiane automatycznie przez electron-builder
//   dla buildu "portable" - to folder, w ktorym faktycznie lezy plik .exe)
// - w trybie deweloperskim (npm start) po prostu folder projektu
const instancesRoot = process.env.PORTABLE_EXECUTABLE_DIR || __dirname;

function instanceDirFor(mcVersion) {
    return path.join(instancesRoot, 'instances', mcVersion);
}

const { loginWithMicrosoft, restoreSession } = require('./src/auth');
const { searchMods, downloadMod, updateInstalledMods } = require('./src/mods');
const { installFabric, installForge, installIrisSodium } = require('./src/loaders');
const { launchGame, stopGame } = require('./src/launcher');

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
        return fallback;
    }
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1150,
        height: 760,
        icon: path.join(__dirname, 'build', 'icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

function send(channel, payload) {
    if (mainWindow) mainWindow.webContents.send(channel, payload);
}

// ---------- USTAWIENIA (kolor motywu itp.) ----------

ipcMain.handle('settings:get', () => readJson(settingsFile, { themeColor: '#8E24AA' }));

ipcMain.handle('settings:set', (e, settings) => {
    writeJson(settingsFile, settings);
    return settings;
});

// ---------- LISTA WERSJI MINECRAFTA (Mojang) ----------
// Pobiera oficjalna liste wersji, zeby uzytkownik wybieral z rozwijanej listy
// zamiast wpisywac wersje recznie.

let versionCache = null;

ipcMain.handle('versions:list', async () => {
    if (versionCache) return versionCache;
    try {
        const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
        const data = await res.json();
        versionCache = {
            latestRelease: data.latest.release,
            latestSnapshot: data.latest.snapshot,
            releases: data.versions.filter(v => v.type === 'release').map(v => v.id),
            snapshots: data.versions.filter(v => v.type === 'snapshot').map(v => v.id)
        };
        return versionCache;
    } catch (e) {
        // fallback gdyby nie bylo internetu - kilka znanych stabilnych wersji
        return {
            latestRelease: '1.21.1',
            latestSnapshot: null,
            releases: ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.17.1', '1.16.5'],
            snapshots: []
        };
    }
});

// ---------- SCIEZKA INSTANCJI (zawsze stabilna, obok pliku .exe) ----------

ipcMain.handle('paths:instanceDir', (e, mcVersion) => instanceDirFor(mcVersion));

// ---------- INSTANCJE (wersja MC + loader zapamietane miedzy uruchomieniami) ----------

ipcMain.handle('instances:get', () => readJson(instancesFile, []));

ipcMain.handle('instances:save', (e, instance) => {
    const list = readJson(instancesFile, []);
    const idx = list.findIndex(i => i.mcVersion === instance.mcVersion);
    if (idx >= 0) list[idx] = instance; else list.push(instance);
    writeJson(instancesFile, list);
    return list;
});

// ---------- KONTO MICROSOFT ----------
// Wylacznie prawdziwe, kupione konto Microsoft (OAuth przez msmc).
// Brak trybu "cracked" / offline / alt-kont - to nie zostanie dodane.

ipcMain.handle('auth:login', async (e, rememberMe) => {
    const profile = await loginWithMicrosoft();
    if (rememberMe) {
        writeJson(accountFile, profile);
    } else {
        try { fs.unlinkSync(accountFile); } catch (err) {}
    }
    return profile;
});

ipcMain.handle('auth:restore', async () => {
    const saved = readJson(accountFile, null);
    if (!saved) return null;
    try {
        const fresh = await restoreSession(saved);
        writeJson(accountFile, fresh);
        return fresh;
    } catch (e) {
        return null;
    }
});

ipcMain.handle('auth:logout', () => {
    try { fs.unlinkSync(accountFile); } catch (e) {}
    return true;
});

// ---------- MODY (Modrinth) ----------

ipcMain.handle('mods:search', (e, query, mcVersion, loader) => searchMods(query, mcVersion, loader));

ipcMain.handle('mods:install', (e, { projectId, mcVersion, loader, instanceDir }) =>
    downloadMod(projectId, mcVersion, loader, instanceDir));

// Sprawdza i pobiera nowsze wersje modow juz zainstalowanych w folderze mods/
ipcMain.handle('mods:updateAll', (e, { mcVersion, loader, instanceDir }) =>
    updateInstalledMods(mcVersion, loader, instanceDir, (line) => send('log:line', line)));

// ---------- LOADERY (Fabric / Forge / Iris+Sodium) ----------

ipcMain.handle('loader:fabric', (e, { mcVersion, instanceDir }) => installFabric(mcVersion, instanceDir));
ipcMain.handle('loader:forge', (e, { mcVersion, instanceDir }) => installForge(mcVersion, instanceDir));
ipcMain.handle('loader:iris', (e, { mcVersion, instanceDir }) => installIrisSodium(mcVersion, instanceDir));

// ---------- URUCHOMIENIE GRY ----------

ipcMain.handle('game:launch', (e, opts) => launchGame(opts, (line) => send('log:line', line)));

ipcMain.handle('game:stop', () => stopGame());

ipcMain.handle('shell:openInstance', (e, dir) => shell.openPath(dir));
