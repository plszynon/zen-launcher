const { Client } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');
const { ensureJava } = require('./java');

let currentProcess = null;

// authProfile MUSI pochodzic z msmc (prawdziwe, zweryfikowane konto Microsoft).
// Brak wsparcia dla logowania offline/cracked.
async function launchGame(opts, onLog) {
    const {
        authProfile,
        instanceDir,
        mcVersion,
        versionCustom,
        ramMinGB = 2,
        ramMaxGB = 4,
        javaPath
    } = opts;

    if (!authProfile) {
        throw new Error('Musisz zalogowac sie przez Microsoft przed uruchomieniem gry.');
    }

    // Zabezpieczenie: upewnij sie, ze folder instancji istnieje (rekurencyjnie),
    // zanim MCLC sprobuje w nim cokolwiek utworzyc.
    fs.mkdirSync(instanceDir, { recursive: true });
    fs.mkdirSync(path.join(instanceDir, 'mods'), { recursive: true });

    // Automatyczny dobor Javy pod wersje Minecrafta (tak jak oficjalny launcher).
    // Jesli podano wlasny javaPath w opcjach, ma pierwszenstwo.
    const runtimesRoot = path.resolve(instanceDir, '..', '..', 'runtimes');
    const autoJavaPath = javaPath || await ensureJava(mcVersion, runtimesRoot, onLog);

    const launcher = new Client();

    const launchOpts = {
        authorization: authProfile,
        root: instanceDir,
        version: {
            number: mcVersion,
            type: 'release',
            custom: versionCustom || undefined
        },
        memory: {
            max: `${ramMaxGB}G`,
            min: `${ramMinGB}G`
        },
        // Windows domyslnie ma niski limit rownoczesnie otwartych plikow, a
        // pobieranie assetow Minecrafta to tysiace malych plikow naraz -
        // ograniczamy rownolegle pobieranie, zeby uniknac bledu EMFILE.
        overrides: {
            maxSockets: 4
        },
        javaPath: autoJavaPath || undefined
    };

    launcher.on('debug', (e) => onLog(`[debug] ${e}`));
    launcher.on('data', (e) => onLog(String(e)));
    launcher.on('progress', (e) => onLog(`[postep] ${e.type}: ${e.task}/${e.total}`));
    launcher.on('error', (e) => onLog(`[blad] ${e}`));
    launcher.on('close', (code) => {
        onLog(`[info] Gra zostala zamknieta (kod ${code}).`);
        currentProcess = null;
    });

    const proc = await launcher.launch(launchOpts);
    currentProcess = proc || null;

    return { started: true, instanceDir: path.resolve(instanceDir) };
}

function stopGame() {
    if (!currentProcess) {
        throw new Error('Gra nie jest uruchomiona.');
    }
    currentProcess.kill();
    currentProcess = null;
    return { stopped: true };
}

function isRunning() {
    return !!currentProcess;
}

module.exports = { launchGame, stopGame, isRunning };
