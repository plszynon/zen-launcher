const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { execFile } = require('child_process');

// Minecraft wymaga roznych wersji Javy w zaleznosci od wersji gry
// (dokladnie tak jak w oficjalnym launcherze Mojanga):
//   1.20.5+          -> Java 21
//   1.18   - 1.20.4  -> Java 17
//   1.17.x           -> Java 16
//   <= 1.16.5        -> Java 8
function requiredJavaMajor(mcVersion) {
    const parts = mcVersion.split('.').map(n => parseInt(n, 10) || 0);
    const [, minor = 0, patch = 0] = parts;

    if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
    if (minor >= 18 && minor <= 20) return 17;
    if (minor === 17) return 16;
    return 8;
}

function getSystemJavaMajor() {
    return new Promise((resolve) => {
        execFile('java', ['-version'], (err, stdout, stderr) => {
            if (err) return resolve(null);
            const text = stderr || stdout || '';
            const match = text.match(/version "(\d+)(?:\.(\d+))?/);
            if (!match) return resolve(null);
            const first = parseInt(match[1], 10);
            const second = match[2] ? parseInt(match[2], 10) : null;
            // stary schemat numeracji: "1.8.0_401" -> Java 8
            resolve(first === 1 && second !== null ? second : first);
        });
    });
}

async function downloadPortableJava(majorVersion, runtimesRoot, onLog) {
    const destDir = path.join(runtimesRoot, `java-${majorVersion}`);
    const marker = path.join(destDir, '.ready');

    if (fs.existsSync(marker)) {
        return findJavaExe(destDir);
    }

    onLog && onLog(`Wymagana Java ${majorVersion}, ktorej nie ma w systemie - pobieranie (jednorazowo, moze potrwac kilka minut)...`);
    fs.mkdirSync(destDir, { recursive: true });

    const url = `https://api.adoptium.net/v3/binary/latest/${majorVersion}/ga/windows/x64/jre/hotspot/normal/eclipse`;
    const zipPath = path.join(os.tmpdir(), `java-${majorVersion}-${Date.now()}.zip`);

    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Nie udalo sie pobrac Javy ${majorVersion}: ${res.status}`);

    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(zipPath);
        res.body.pipe(out);
        res.body.on('error', reject);
        out.on('finish', resolve);
    });

    onLog && onLog('Rozpakowywanie Javy...');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);
    fs.unlinkSync(zipPath);
    fs.writeFileSync(marker, 'ok');

    onLog && onLog(`Java ${majorVersion} gotowa.`);
    return findJavaExe(destDir);
}

function findJavaExe(destDir) {
    // paczka Adoptium rozpakowuje sie do jednego podfolderu, np. jdk-17.0.9+9-jre/
    const entries = fs.readdirSync(destDir, { withFileTypes: true }).filter(e => e.isDirectory());
    const root = entries.length ? path.join(destDir, entries[0].name) : destDir;

    const javawPath = path.join(root, 'bin', 'javaw.exe');
    const javaPath = path.join(root, 'bin', 'java.exe');

    if (fs.existsSync(javaPath)) return javaPath; // java.exe (nie javaw) - zeby dzialal odczyt logow
    if (fs.existsSync(javawPath)) return javawPath;
    throw new Error('Nie znaleziono pliku java.exe po rozpakowaniu.');
}

/**
 * Zwraca sciezke do Javy pasujacej do wersji Minecrafta:
 * - jesli systemowa Java juz pasuje, uzywa jej (nic nie pobiera)
 * - w przeciwnym razie pobiera i cache'uje wlasna, przenosna Java (Adoptium)
 */
async function ensureJava(mcVersion, runtimesRoot, onLog) {
    const required = requiredJavaMajor(mcVersion);
    const systemMajor = await getSystemJavaMajor();

    if (systemMajor && systemMajor >= required) {
        return null; // null = uzyj systemowej Javy (domyslne zachowanie MCLC)
    }

    return downloadPortableJava(required, runtimesRoot, onLog);
}

module.exports = { ensureJava, requiredJavaMajor };
