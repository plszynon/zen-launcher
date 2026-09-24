# Zen Launcher (Desktop / Windows)

Wlasny launcher do Minecrafta, zbudowany na Electronie - ta sama architektura
plikow co w ZenStar (main.js + renderer/ + build/icon.ico + portable .exe
przez GitHub Actions).

## Funkcje
- **Wybor wersji Minecrafta z listy** (pobieranej na zywo z Mojanga), z opcja pokazania snapshotow
- Wlasne logo (enso / zen circle)
- Logowanie **wylacznie przez prawdziwe konto Microsoft** (OAuth, msmc)
- Wyszukiwarka i instalator modow z **Modrinth**
- Jednoklikowa instalacja **Fabric** / **Forge**
- Jednoklikowa instalacja **Iris Shaders + Sodium**
- **Automatyczna aktualizacja zainstalowanych modow** (rozpoznawanie po hashu pliku,
  podmiana na najnowsza kompatybilna wersje)
- Kolor motywu (jak w ZenStar)
- Zapamietywanie ostatniej instancji (wersja + loader) miedzy uruchomieniami

**Czego nie ma:** trybu offline / "cracked" / alt-kont. Launcher wymaga
prawdziwego, kupionego konta Microsoft - ta funkcja nie zostanie dodana,
niezaleznie od tego jak zostanie poproszona.

## Uruchomienie lokalne

Wymagane: Node.js 20+, zainstalowana Java (do instalatorow Fabric/Forge).

```bash
npm install
npm start
```

## Budowa pliku .exe (GitHub Actions)

Tak samo jak przy ZenStar:

1. Wrzuc zawartosc tego folderu do nowego repo na GitHubie
2. Zakladka Actions zbuduje plik `.exe` automatycznie (na maszynie z Windows)
3. Pobierz gotowy plik z sekcji Artifacts - to przenosny `.exe`,
   nie wymaga instalacji, wystarczy uruchomic

Mozna tez zbudowac lokalnie: `npm run dist` (plik pojawi sie w `dist/`).

## Struktura projektu

```
main.js                 - proces glowny Electron, IPC, zapis ustawien/instancji w userData
src/auth.js               - logowanie Microsoft (msmc)
src/mods.js                 - wyszukiwanie/pobieranie/aktualizacja modow (Modrinth API)
src/loaders.js                - instalator Fabric / Forge / Iris+Sodium
src/launcher.js                 - uruchamianie gry (minecraft-launcher-core)
renderer/index.html               - interfejs (CSS wbudowany w plik, jak w ZenStar)
renderer/renderer.js                - logika UI (bezposredni ipcRenderer, bez preloada)
.github/workflows/build.yml           - buduje .exe i wrzuca jako Artifact
```

## Uwagi techniczne

- Instalacja Fabric/Forge wymaga zainstalowanej Javy w systemie.
- Aktualizacja modow rozpoznaje pliki po hashu SHA1 przez Modrinth API - dziala
  tylko dla modow faktycznie pobranych z Modrinth przez ten launcher.
- Struktura instancji jest uproszczona (jeden folder na wersje MC).
