const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { downloadMod } = require('./mods');

function download(url, dest) {
    return fetch(url).then(res => {
        if (!res.ok) throw new Error(`Pobieranie nie powiodlo sie (${res.status}): ${url}`);
        return new Promise((resolve, reject) => {
            const out = fs.createWriteStream(dest);
            res.body.pipe(out);
            res.body.on('error', reject);
            out.on('finish', resolve);
        });
    });
}

function run(javaExe, args) {
    return new Promise((resolve, reject) => {
        execFile(javaExe, args, { maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout);
        });
    });
}

// Instaluje Fabric dla podanej wersji MC przy uzyciu oficjalnego instalatora.
async function installFabric(mcVersion, instanceDir) {
    fs.mkdirSync(instanceDir, { recursive: true });

    const loaderRes = await fetch('https://meta.fabricmc.net/v2/versions/loader');
    const loaderVersions = await loaderRes.json();
    const loaderVersion = loaderVersions[0].version;

    const installerListRes = await fetch('https://meta.fabricmc.net/v2/versions/installer');
    const installers = await installerListRes.json();
    const installerVersion = installers[0].version;

    const installerUrl = `https://maven.fabricmc.net/net/fabricmc/fabric-installer/${installerVersion}/fabric-installer-${installerVersion}.jar`;
    const installerJar = path.join(os.tmpdir(), `fabric-installer-${installerVersion}.jar`);
    await download(installerUrl, installerJar);

    await run('java', [
        '-jar', installerJar,
        'client',
        '-dir', instanceDir,
        '-mcversion', mcVersion,
        '-loader', loaderVersion,
        '-noprofile'
    ]);

    return { versionId: `fabric-loader-${loaderVersion}-${mcVersion}`, loaderVersion };
}

// Instaluje Forge przy uzyciu oficjalnego instalatora (najnowszy rekomendowany build).
async function installForge(mcVersion, instanceDir) {
    fs.mkdirSync(instanceDir, { recursive: true });

    const promoRes = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
    const promo = await promoRes.json();
    const key = promo.promos[`${mcVersion}-recommended`] ? `${mcVersion}-recommended` : `${mcVersion}-latest`;
    const forgeVersion = promo.promos[key];
    if (!forgeVersion) throw new Error(`Brak buildu Forge dla Minecraft ${mcVersion}`);

    const full = `${mcVersion}-${forgeVersion}`;
    const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`;
    const installerJar = path.join(os.tmpdir(), `forge-installer-${full}.jar`);
    await download(installerUrl, installerJar);

    await run('java', ['-jar', installerJar, '--installClient', instanceDir]);

    return { versionId: full, forgeVersion };
}

// Instaluje Iris Shaders + wymagany Sodium (przez Modrinth). Wymaga Fabric.
async function installIrisSodium(mcVersion, instanceDir) {
    const sodium = await downloadMod('AANobbMI', mcVersion, 'fabric', instanceDir); // Sodium
    const iris = await downloadMod('YL57xq9U', mcVersion, 'fabric', instanceDir);   // Iris
    return { sodium, iris };
}

module.exports = { installFabric, installForge, installIrisSodium };
