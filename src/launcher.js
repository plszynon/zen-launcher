const { Client } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');

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
        javaPath: javaPath || undefined
    };

    launcher.on('debug', (e) => onLog(`[debug] ${e}`));
    launcher.on('data', (e) => onLog(String(e)));
    launcher.on('progress', (e) => onLog(`[postep] ${e.type}: ${e.task}/${e.total}`));
    launcher.on('error', (e) => onLog(`[blad] ${e}`));

    await launcher.launch(launchOpts);
    return { started: true, instanceDir: path.resolve(instanceDir) };
}

module.exports = { launchGame };
