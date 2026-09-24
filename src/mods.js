const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const API = 'https://api.modrinth.com/v2';
const HEADERS = { 'User-Agent': 'zen-launcher/1.0.0 (contact: you@example.com)' };

async function searchMods(query, mcVersion, loader) {
    const facets = [['project_type:mod']];
    if (mcVersion) facets.push([`versions:${mcVersion}`]);
    if (loader) facets.push([`categories:${loader}`]);

    const url = `${API}/search?query=${encodeURIComponent(query || '')}&facets=${encodeURIComponent(JSON.stringify(facets))}&limit=30`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Wyszukiwanie Modrinth nie powiodlo sie: ${res.status}`);
    const data = await res.json();

    return data.hits.map(h => ({
        id: h.project_id,
        slug: h.slug,
        title: h.title,
        description: h.description,
        downloads: h.downloads,
        iconUrl: h.icon_url
    }));
}

async function fetchBestVersion(projectId, mcVersion, loader) {
    const url = `${API}/project/${projectId}/version?game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}&loaders=${encodeURIComponent(JSON.stringify([loader]))}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Nie udalo sie pobrac wersji moda: ${res.status}`);
    const versions = await res.json();
    if (!versions.length) throw new Error(`Brak wersji dla MC ${mcVersion} / ${loader}`);
    return versions[0];
}

async function downloadFile(fileUrl, dest) {
    const res = await fetch(fileUrl, { headers: HEADERS });
    if (!res.ok) throw new Error(`Pobieranie nie powiodlo sie: ${res.status}`);
    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(dest);
        res.body.pipe(out);
        res.body.on('error', reject);
        out.on('finish', resolve);
    });
}

async function downloadMod(projectId, mcVersion, loader, instanceDir) {
    const best = await fetchBestVersion(projectId, mcVersion, loader);
    const file = best.files.find(f => f.primary) || best.files[0];

    const modsDir = path.join(instanceDir, 'mods');
    fs.mkdirSync(modsDir, { recursive: true });

    const dest = path.join(modsDir, file.filename);
    await downloadFile(file.url, dest);

    return { filename: file.filename, path: dest, version: best.version_number, projectId };
}

// ---------- AUTO-AKTUALIZACJA MODOW ----------
// Przechodzi przez wszystkie .jar w mods/, probuje je rozpoznac na Modrinth
// po hashu SHA1 pliku i sciaga nowsza wersje jesli jest dostepna.

const crypto = require('crypto');

function sha1(filePath) {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha1').update(buf).digest('hex');
}

async function updateInstalledMods(mcVersion, loader, instanceDir, onLog) {
    const modsDir = path.join(instanceDir, 'mods');
    if (!fs.existsSync(modsDir)) return { updated: [], upToDate: [], unknown: [] };

    const files = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar'));
    const updated = [];
    const upToDate = [];
    const unknown = [];

    for (const filename of files) {
        const filePath = path.join(modsDir, filename);
        const hash = sha1(filePath);

        try {
            // rozpoznanie moda po hashu pliku
            const lookupRes = await fetch(`${API}/version_file/${hash}`, { headers: HEADERS });
            if (!lookupRes.ok) { unknown.push(filename); continue; }
            const currentVersion = await lookupRes.json();
            const projectId = currentVersion.project_id;

            const best = await fetchBestVersion(projectId, mcVersion, loader);
            if (best.id === currentVersion.id) {
                upToDate.push(filename);
                continue;
            }

            onLog && onLog(`Aktualizacja: ${filename} -> ${best.version_number}`);
            fs.unlinkSync(filePath);
            const file = best.files.find(f => f.primary) || best.files[0];
            await downloadFile(file.url, path.join(modsDir, file.filename));
            updated.push({ from: filename, to: file.filename, version: best.version_number });
        } catch (e) {
            unknown.push(filename);
        }
    }

    return { updated, upToDate, unknown };
}

module.exports = { searchMods, downloadMod, updateInstalledMods };
