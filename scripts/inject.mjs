/*
 * Bleeds Client — Local injector for Discord Desktop
 * Injects Bleeds Client into an existing Discord installation by:
 * 1. Finding the Discord resources directory
 * 2. Renaming app.asar -> _app.asar (backup)
 * 3. Creating an app/ folder with a loader that requires Bleeds Client's patcher.js
 *
 * Usage: pnpm inject   (or: node scripts/inject.mjs)
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const BASE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(BASE_DIR, "dist", "desktop");

// ── Locate Discord installations ─────────────────────────────────────────────
function findAllDiscordResources() {
    const platform = process.platform;
    const candidates = [];

    if (platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || "";

        for (const channel of ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"]) {
            const base = join(localAppData, channel);
            if (!existsSync(base)) continue;
            try {
                const versions = readdirSync(base)
                    .filter(d => /^app-\d+\.\d+\.\d+$/.test(d))
                    .sort()
                    .reverse();
                for (const ver of versions) {
                    candidates.push(join(base, ver, "resources"));
                }
            } catch { }
        }
    } else if (platform === "darwin") {
        candidates.push(
            "/Applications/Discord.app/Contents/Resources",
            "/Applications/Discord PTB.app/Contents/Resources",
            "/Applications/Discord Canary.app/Contents/Resources"
        );
    } else if (platform === "linux") {
        candidates.push(
            "/usr/share/discord/resources",
            "/usr/lib/discord/resources",
            "/opt/discord/resources",
            "/opt/Discord/resources",
            join(process.env.HOME || "", ".local/share/flatpak/app/com.discordapp.Discord/current/active/files/discord/resources"),
            "/snap/discord/current/usr/share/discord/resources"
        );
    }

    return candidates.filter(p => {
        if (!existsSync(p)) return false;
        return existsSync(join(p, "app.asar")) || existsSync(join(p, "app")) || existsSync(join(p, "_app.asar"));
    });
}

// ── Check dist/ exists ───────────────────────────────────────────────────────
function checkBuild() {
    const patcherPath = join(DIST_DIR, "patcher.js");
    if (!existsSync(patcherPath)) {
        console.error("\x1b[31m[Bleeds] dist/desktop/patcher.js not found!\x1b[0m");
        console.error("\x1b[33m           Run 'pnpm build' first, then try again.\x1b[0m");
        process.exit(1);
    }
}

// ── Inject ───────────────────────────────────────────────────────────────────
function inject(resourcesDir) {
    const appAsarPath = join(resourcesDir, "app.asar");
    const backupPath = join(resourcesDir, "_app.asar");
    const appDirPath = join(resourcesDir, "app");

    // Check if already injected
    if (existsSync(appDirPath) && existsSync(join(appDirPath, "package.json"))) {
        try {
            const pkg = JSON.parse(readFileSync(join(appDirPath, "package.json"), "utf-8"));
            if (pkg.name === "bleeds-client") {
                console.log("\x1b[33m[Bleeds] Already injected! Run 'pnpm uninject' first to re-inject.\x1b[0m");
                return false;
            }
        } catch { }
    }

    // Step 1: Backup app.asar -> _app.asar
    if (existsSync(appAsarPath) && !existsSync(backupPath)) {
        let isDir = false;
        try { isDir = statSync(appAsarPath).isDirectory(); } catch { }
        if (isDir) {
            console.warn("\x1b[33m[Bleeds] app.asar is a directory — another mod may be installed.\x1b[0m");
            console.warn("\x1b[33m            Aborting. Run 'pnpm uninject' to clean up first.\x1b[0m");
            return false;
        }
        console.log("[Bleeds] Backing up app.asar -> _app.asar...");
        renameSync(appAsarPath, backupPath);
    } else if (!existsSync(backupPath)) {
        console.error("\x1b[31m[Bleeds] No app.asar or _app.asar found in resources!\x1b[0m");
        return false;
    }

    // Step 2: Remove old app.asar if it exists (may be a directory from a previous injection)
    if (existsSync(appAsarPath)) {
        try {
            rmSync(appAsarPath, { recursive: true, force: true });
        } catch (e) {
            console.error(`\x1b[31m[Bleeds] Failed to remove old app.asar: ${e.message}\x1b[0m`);
            return false;
        }
    }

    // Step 3: Create app/ folder with the loader
    mkdirSync(appDirPath, { recursive: true });

    writeFileSync(join(appDirPath, "package.json"), JSON.stringify({
        name: "bleeds-client",
        main: "index.js"
    }, null, 2));

    const patcherPath = join(DIST_DIR, "patcher.js").replace(/\\/g, "\\\\");
    writeFileSync(join(appDirPath, "index.js"),
        `// Bleeds Client Injector — auto-generated, do not edit\n"use strict";\nrequire("${patcherPath}");\n`
    );

    console.log(`\x1b[32m[Bleeds] Injected successfully into: ${resourcesDir}\x1b[0m`);
    console.log(`\x1b[32m[Bleeds] Bleeds Client dist directory: ${DIST_DIR}\x1b[0m`);
    console.log("\x1b[36m[Bleeds] Restart Discord to apply the changes.\x1b[0m");
    return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────
checkBuild();

const allResources = findAllDiscordResources();
if (allResources.length === 0) {
    console.error("\x1b[31m[Bleeds] No Discord installation found!\x1b[0m");
    console.error("\x1b[33m           Make sure Discord (Stable, PTB or Canary) is installed.\x1b[0m");
    process.exit(1);
}

if (allResources.length === 1) {
    console.log(`[Bleeds] Discord found: ${allResources[0]}`);
    inject(allResources[0]);
} else {
    console.log(`[Bleeds] ${allResources.length} Discord installations found:`);
    let injectedCount = 0;
    for (const res of allResources) {
        console.log(`\n  -> ${res}`);
        if (inject(res)) injectedCount++;
    }
    console.log(`\n\x1b[32m[Bleeds] ${injectedCount}/${allResources.length} injection(s) succeeded.\x1b[0m`);
}
