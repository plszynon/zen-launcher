const { ipcRenderer } = require('electron');

function $(id) { return document.getElementById(id); }

const state = {
    authProfile: null,
    instanceDir: null,
    versionCustom: null
};

function log(line) {
    const out = $('logOutput');
    out.textContent += line + '\n';
    out.scrollTop = out.scrollHeight;
}

async function instanceDirFor(mcVersion) {
    return ipcRenderer.invoke('paths:instanceDir', mcVersion);
}

// ---------- LISTA WERSJI MINECRAFTA ----------

let versionData = null;

async function loadVersions(preferredValue) {
    const select = $('mcVersion');
    if (!versionData) {
        versionData = await ipcRenderer.invoke('versions:list');
    }

    const showSnapshots = $('showSnapshots').checked;
    const list = showSnapshots ? [...versionData.releases, ...versionData.snapshots] : versionData.releases;

    const toSelect = preferredValue || select.value || versionData.latestRelease;

    select.innerHTML = '';
    list.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id;
        select.appendChild(opt);
    });

    if (list.includes(toSelect)) {
        select.value = toSelect;
    } else if (list.length) {
        select.value = list[0];
    }
}

$('showSnapshots').addEventListener('change', () => loadVersions());

// ---------- MOTYW ----------

async function applyTheme(color) {
    document.documentElement.style.setProperty('--theme-color', color);
}

async function loadSettings() {
    const settings = await ipcRenderer.invoke('settings:get');
    applyTheme(settings.themeColor || '#8E24AA');
}

document.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', async () => {
        const color = sw.getAttribute('data-color');
        applyTheme(color);
        await ipcRenderer.invoke('settings:set', { themeColor: color });
    });
});

$('menuBtn').addEventListener('click', () => {
    $('menuDropdown').classList.toggle('show');
});
document.addEventListener('click', (e) => {
    if (!e.target.closest('#menuDropdown') && !e.target.closest('#menuBtn')) {
        $('menuDropdown').classList.remove('show');
    }
});

$('openInstanceBtn').addEventListener('click', async () => {
    const mcVersion = $('mcVersion').value.trim();
    const dir = state.instanceDir || await instanceDirFor(mcVersion);
    ipcRenderer.invoke('shell:openInstance', dir);
});

// ---------- KONTO MICROSOFT ----------

function refreshAccountUI() {
    if (state.authProfile) {
        $('accountName').textContent = state.authProfile.profile.name || 'Zalogowano';
        $('loginBtn').style.display = 'none';
        $('logoutBtn').style.display = 'inline-block';
    } else {
        $('accountName').textContent = 'Niezalogowany';
        $('loginBtn').style.display = 'inline-block';
        $('logoutBtn').style.display = 'none';
    }
}

$('loginBtn').addEventListener('click', async () => {
    try {
        log('Logowanie przez Microsoft...');
        const rememberMe = $('rememberMe').checked;
        state.authProfile = await ipcRenderer.invoke('auth:login', rememberMe);
        log('Zalogowano jako ' + state.authProfile.profile.name + (rememberMe ? ' (zapamietano)' : ''));
    } catch (e) {
        log('Blad logowania: ' + e.message);
    }
    refreshAccountUI();
});

$('logoutBtn').addEventListener('click', async () => {
    await ipcRenderer.invoke('auth:logout');
    state.authProfile = null;
    refreshAccountUI();
});

// ---------- LOADERY ----------

$('installLoaderBtn').addEventListener('click', async () => {
    const mcVersion = $('mcVersion').value.trim();
    const loader = $('loaderSelect').value;
    const instanceDir = await instanceDirFor(mcVersion);
    state.instanceDir = instanceDir;

    try {
        if (loader === 'fabric') {
            log('Instalowanie Fabric...');
            const r = await ipcRenderer.invoke('loader:fabric', { mcVersion, instanceDir });
            state.versionCustom = r.versionId;
            log('Fabric zainstalowany: ' + r.versionId);
        } else if (loader === 'forge') {
            log('Instalowanie Forge...');
            const r = await ipcRenderer.invoke('loader:forge', { mcVersion, instanceDir });
            state.versionCustom = r.versionId;
            log('Forge zainstalowany: ' + r.versionId);
        } else {
            state.versionCustom = null;
            log('Vanilla - brak dodatkowego loadera do instalacji.');
        }
        await ipcRenderer.invoke('instances:save', { mcVersion, loader, versionCustom: state.versionCustom });
    } catch (e) {
        log('Blad instalacji loadera: ' + e.message);
    }
});

$('installIrisBtn').addEventListener('click', async () => {
    const mcVersion = $('mcVersion').value.trim();
    const instanceDir = state.instanceDir || await instanceDirFor(mcVersion);
    try {
        log('Instalowanie Iris + Sodium (wymaga Fabric)...');
        await ipcRenderer.invoke('loader:iris', { mcVersion, instanceDir });
        log('Iris + Sodium zainstalowane.');
    } catch (e) {
        log('Blad instalacji Iris: ' + e.message);
    }
});

// ---------- URUCHOMIENIE ----------

$('launchBtn').addEventListener('click', async () => {
    const mcVersion = $('mcVersion').value.trim();
    const instanceDir = state.instanceDir || await instanceDirFor(mcVersion);
    try {
        log('Uruchamianie gry...');
        await ipcRenderer.invoke('game:launch', {
            authProfile: state.authProfile ? state.authProfile.profile : null,
            instanceDir,
            mcVersion,
            versionCustom: state.versionCustom
        });
    } catch (e) {
        log('Blad uruchamiania: ' + e.message);
    }
});

// ---------- MODY ----------

$('modSearchBtn').addEventListener('click', async () => {
    const query = $('modSearch').value;
    const mcVersion = $('mcVersion').value.trim();
    const loaderRaw = $('loaderSelect').value;
    const loader = loaderRaw === 'vanilla' ? undefined : loaderRaw;
    const results = $('modResults');
    results.innerHTML = '';

    try {
        const mods = await ipcRenderer.invoke('mods:search', query, mcVersion, loader);
        mods.forEach(mod => {
            const li = document.createElement('li');
            const span = document.createElement('span');
            span.textContent = `${mod.title} - ${mod.description}`;
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.textContent = 'Instaluj';
            btn.addEventListener('click', async () => {
                const instanceDir = state.instanceDir || await instanceDirFor(mcVersion);
                try {
                    await ipcRenderer.invoke('mods:install', {
                        projectId: mod.id, mcVersion, loader: loader || 'fabric', instanceDir
                    });
                    log(`Zainstalowano mod: ${mod.title}`);
                } catch (e) {
                    log(`Blad instalacji moda ${mod.title}: ${e.message}`);
                }
            });
            li.appendChild(span);
            li.appendChild(btn);
            results.appendChild(li);
        });
    } catch (e) {
        log('Blad wyszukiwania modow: ' + e.message);
    }
});

$('modUpdateAllBtn').addEventListener('click', async () => {
    const mcVersion = $('mcVersion').value.trim();
    const loaderRaw = $('loaderSelect').value;
    const loader = loaderRaw === 'vanilla' ? 'fabric' : loaderRaw;
    const instanceDir = state.instanceDir || await instanceDirFor(mcVersion);

    try {
        log('Sprawdzanie aktualizacji modow...');
        const result = await ipcRenderer.invoke('mods:updateAll', { mcVersion, loader, instanceDir });
        log(`Zaktualizowano: ${result.updated.length}, aktualne: ${result.upToDate.length}, nierozpoznane: ${result.unknown.length}`);
    } catch (e) {
        log('Blad aktualizacji modow: ' + e.message);
    }
});

// logi z procesu glownego (postep pobierania gry, aktualizacje modow)
ipcRenderer.on('log:line', (e, line) => log(line));

// przywrocenie sesji Microsoft i ostatniej instancji przy starcie
(async () => {
    await loadSettings();

    const restored = await ipcRenderer.invoke('auth:restore');
    if (restored) {
        state.authProfile = restored;
        refreshAccountUI();
        log('Przywrocono sesje: ' + restored.profile.name);
    }

    const instances = await ipcRenderer.invoke('instances:get');
    const last = instances.length ? instances[instances.length - 1] : null;

    log('Pobieranie listy wersji Minecrafta...');
    await loadVersions(last ? last.mcVersion : null);
    log('Lista wersji zaladowana.');

    if (last) {
        $('loaderSelect').value = last.loader;
        state.instanceDir = await instanceDirFor(last.mcVersion);
        state.versionCustom = last.versionCustom || null;
    }
})();
