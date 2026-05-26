const { execSync } = require("child_process");
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, cpSync, renameSync, rmSync } = require("fs");
const { createHash } = require("crypto");
const { join } = require("path");

// ─── Bleeds Client Build Configuration ─────────────────────────────────────

function killBleeds() {
    const releaseDir = join(__dirname, "release", "bleeds-dist");
    const releaseExe = join(releaseDir, "Discord.exe");

    try {
        execSync(
            `powershell -NoProfile -Command "Get-Process Discord -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${releaseExe.replace(/'/g, "''")}'} | Stop-Process -Force"`,
            { stdio: "ignore", shell: true }
        );
    } catch (_) { }

    const resDir = join(releaseDir, "resources");
    for (const name of ["app.asar", "_app.asar"]) {
        const p = join(resDir, name);
        if (!existsSync(p)) continue;
        try { rmSync(p, { recursive: true, force: true }); } catch (_) { }
    }
}

function findDiscordApp() {
    const base = join(process.env.LOCALAPPDATA, "Discord");
    let best = null, bestVer = [0, 0, 0];
    try {
        for (const e of readdirSync(base)) {
            const m = e.match(/^app-(\d+)\.(\d+)\.(\d+)$/);
            if (!m) continue;
            const v = [+m[1], +m[2], +m[3]];
            if (v[0] > bestVer[0] || v[1] > bestVer[1] || v[2] > bestVer[2]) { bestVer = v; best = join(base, e); }
        }
    } catch { }
    if (!best) throw new Error("Discord not found. Make sure Discord is installed.");
    return best;
}

function buildEquicord() {
    console.log("[build] Compiling Bleeds Client...");
    execSync("node --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs --standalone", { stdio: "inherit" });
}

function buildBleedsFromDiscord(discordApp) {
    const discordRes = join(discordApp, "resources");
    const outDir = join(__dirname, "release", "bleeds-dist");

    if (existsSync(outDir)) {
        try { rmSync(outDir, { recursive: true, force: true }); } catch (e) { }
    }

    console.log("[bleeds] Copying Discord binaries...");
    mkdirSync(outDir, { recursive: true });

    for (const f of readdirSync(discordApp)) {
        if (f === "resources" || f === "modules") continue;
        const src = join(discordApp, f);
        const dst = join(outDir, f);
        try { cpSync(src, dst, { recursive: true }); } catch (e) { }
    }

    const outModules = join(outDir, "modules");
    mkdirSync(outModules, { recursive: true });

    const discordModules = join(discordApp, "modules");
    if (existsSync(discordModules)) {
        for (const mod of readdirSync(discordModules)) {
            const src = join(discordModules, mod);
            if (!statSync(src).isDirectory()) continue;
            const dst = join(outModules, mod);
            try { cpSync(src, dst, { recursive: true }); } catch (e) { }
        }
    }

    const outRes = join(outDir, "resources");
    mkdirSync(outRes, { recursive: true });

    const buildInfoSrc = join(discordRes, "build_info.json");
    if (existsSync(buildInfoSrc)) {
        const buildInfo = JSON.parse(readFileSync(buildInfoSrc, "utf8"));
        buildInfo.newUpdater = false;
        buildInfo.localModulesRoot = "modules";
        writeFileSync(join(outRes, "build_info.json"), JSON.stringify(buildInfo, null, 2));
    }

    const bootstrapSrc = join(discordRes, "bootstrap");
    const bootstrapDst = join(outRes, "bootstrap");
    if (existsSync(bootstrapSrc)) {
        mkdirSync(bootstrapDst, { recursive: true });
        cpSync(bootstrapSrc, bootstrapDst, { recursive: true });
    }

    console.log("[bleeds] Preparing _app.asar...");
    let appAsarSrc = join(discordRes, "_app.asar");
    if (!existsSync(appAsarSrc)) appAsarSrc = join(discordRes, "app.asar");
    
    if (existsSync(appAsarSrc)) {
        cpSync(appAsarSrc, join(outRes, "_app.asar"), { recursive: statSync(appAsarSrc).isDirectory() });
    }

    const outAppAsar = join(outRes, "app.asar");
    mkdirSync(outAppAsar, { recursive: true });
    writeFileSync(join(outAppAsar, "package.json"), JSON.stringify({ name: "discord", main: "index.js" }, null, 2));
    writeFileSync(join(outAppAsar, "index.js"), `
"use strict";
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

app.setPath("userData", path.join(app.getPath("appData"), "Bleeds Client"));
app.setAppUserModelId("com.squirrel.Discord.Discord");

const bundledModulesPath = path.join(path.dirname(process.execPath), "modules");
require(path.join(__dirname, "..", "app", "dist", "desktop", "patcher.js"));
`);

    const outApp = join(outRes, "app");
    mkdirSync(outApp, { recursive: true });
    writeFileSync(join(outApp, "package.json"), JSON.stringify({ name: "bleeds-client", main: "index.js", version: "1.18.0" }, null, 2));
    writeFileSync(join(outApp, "index.js"), `
"use strict";
const path = require("path");
const { app } = require("electron");

app.setPath("userData", path.join(app.getPath("appData"), "Bleeds Client"));
app.setAppUserModelId("com.squirrel.Discord.Discord");

require(path.join(__dirname, "dist", "desktop", "patcher.js"));
`);

    const outDist = join(outApp, "dist", "desktop");
    mkdirSync(outDist, { recursive: true });
    const equicordDist = join(__dirname, "dist", "desktop");

    for (const f of ["patcher.js", "renderer.js", "renderer.css", "renderer.js.LEGAL.txt"]) {
        if (existsSync(join(equicordDist, f))) cpSync(join(equicordDist, f), join(outDist, f));
    }

    const bleedsPreload = join(__dirname, "bleeds-preload.js");
    if (existsSync(bleedsPreload)) {
        cpSync(bleedsPreload, join(outDist, "preload.js"));
    }

    // FFmpeg and YT-DLP (search local folder or PATH)
    const binDir = join(__dirname, "static", "bin");
    for (const bin of ["ffmpeg.exe", "yt-dlp.exe"]) {
        const localBin = join(binDir, bin);
        if (existsSync(localBin)) cpSync(localBin, join(outDir, bin));
    }

    const discordExe = join(outDir, "Discord.exe");
    const injectScript = join(__dirname, "tools", "inject-discord.ps1");
    if (existsSync(injectScript)) cpSync(injectScript, join(outDir, "inject-discord.ps1"));

    const iconSrc = join(__dirname, "bleeds.ico");
    if (existsSync(iconSrc)) {
        cpSync(iconSrc, join(outDir, "app.ico"));
        // Rcedit for branding
        try {
            const rcedit = join(__dirname, "node_modules", ".bin", "rcedit.cmd");
            if (existsSync(rcedit)) {
                execSync(`"${rcedit}" "${discordExe}" --set-icon "${iconSrc}" --set-version-string "ProductName" "Bleeds Client" --set-version-string "FileDescription" "Bleeds Client"`, { stdio: "ignore" });
            }
        } catch (e) { }
    }

    console.log(`[bleeds] Build complete -> ${outDir}`);
}

function obfuscateDesktop() {
    // Light obfuscation for basic IP protection without hurting performance
    const obfArgs = ["--compact", "true", "--simplify", "true", "--string-array", "true"];
    const files = ["patcher.js", "preload.js", "renderer.js"];
    for (const f of files) {
        const fp = join(__dirname, "dist", "desktop", f);
        if (!existsSync(fp)) continue;
        try { execSync(`npx javascript-obfuscator "${fp}" --output "${fp}" ${obfArgs.join(" ")}`, { stdio: "ignore" }); } catch (e) { }
    }
}

// ─── Build Execution ───────────────────────────────────────────────────────

killBleeds();
const discord = findDiscordApp();
buildEquicord();
// obfuscateDesktop(); // Optional for open source
buildBleedsFromDiscord(discord);

module.exports = {
    appId: "com.bleedsclient.app",
    productName: "Bleeds Client",
    copyright: "Copyright 2026 Bleeds Client",
    extraMetadata: { main: "index.js" },
    asar: false,
    files: ["index.js", "dist/desktop/**/*", "!**/*.map", "!**/*.ts"],
    directories: { output: "release", buildResources: "desktop/assets" },
    win: {
        target: [{ target: "dir", arch: ["x64"] }],
        icon: "bleeds.ico",
        requestedExecutionLevel: "asInvoker"
    }
};
