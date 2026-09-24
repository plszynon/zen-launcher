// Logowanie do konta Microsoft dla Minecrafta.
//
// Ten launcher obsluguje WYLACZNIE prawdziwe, kupione konto Microsoft/Xbox
// przez oficjalny przeplyw OAuth (msmc). Nie ma trybu offline / "cracked" /
// alt-kont - to wymagaloby obejscia weryfikacji posiadania gry przez Mojang,
// czego ten projekt nie implementuje.

const { Auth } = require('msmc');

async function loginWithMicrosoft() {
    const authManager = new Auth('select_account');
    const xboxManager = await authManager.launch('electron');
    const token = await xboxManager.getMinecraft();

    if (!token.mclc) {
        throw new Error('Nie udalo sie pobrac profilu Minecraft. Czy to konto ma kupiona gre?');
    }

    return {
        raw: token.save ? token.save() : null,
        profile: token.mclc()
    };
}

async function restoreSession(saved) {
    if (!saved || !saved.raw) throw new Error('Brak zapisanej sesji');
    const authManager = new Auth('select_account');
    const xboxManager = await authManager.refresh(saved.raw);
    const token = await xboxManager.getMinecraft();

    return {
        raw: token.save ? token.save() : null,
        profile: token.mclc()
    };
}

module.exports = { loginWithMicrosoft, restoreSession };
