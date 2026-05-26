/*
 * Bleeds Client — Installer via EquilotlCli
 * Downloads EquilotlCli.exe from the Equicord releases and launches it
 * with environment variables pointing to the Bleeds Client files.
 *
 * The exe shows a GUI to choose the Discord target.
 *
 * Usage:
 *   pnpm inject    -> installs Bleeds Client into the chosen Discord
 *   pnpm uninject  -> uninstalls Bleeds Client from the chosen Discord
 *   pnpm repair    -> repairs the installation
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { execFileSync, execSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync, rmSync, statSync } from "fs";
import { chmodSync } from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { fileURLToPath } from "url";

// EquilotlCli is Equicord's graphical installer — reused for Bleeds Client
const BASE_URL = "https://github.com/Equicord/Equilotl/releases/latest/download/";
const INSTALLER_PATH_DARWIN = "Equilotl.app/Contents/MacOS/Equilotl";
const INSTALLER_APP_DARWIN = "Equilotl.app";

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE_DIR = join(BASE_DIR, "dist", "Installer");
const ETAG_FILE = join(FILE_DIR, "etag.txt");

function getFilename() {
    switch (process.platform) {
        case "win32":
            return "EquilotlCli.exe";
        case "darwin":
            return "Equilotl.MacOS.zip";
        case "linux":
            return "EquilotlCli-linux";
        default:
            throw new Error("Unsupported platform: " + process.platform);
    }
}

async function ensureBinary() {
    const filename = getFilename();

    mkdirSync(FILE_DIR, { recursive: true });

    const downloadName = join(FILE_DIR, filename);
    const outputFile = process.platform === "darwin"
        ? join(FILE_DIR, INSTALLER_PATH_DARWIN)
        : downloadName;
    const outputApp = process.platform === "darwin"
        ? join(FILE_DIR, INSTALLER_APP_DARWIN)
        : null;

    // If the binary already exists, use it directly
    if (existsSync(outputFile)) {
        console.log("[Bleeds] Installer already present, using local copy.");
        return outputFile;
    }

    console.log("[Bleeds] Downloading installer (" + filename + ")...");

    const res = await fetch(BASE_URL + filename, {
        headers: {
            "User-Agent": "Bleeds Client (https://github.com/bleedsclient/bleeds-client)"
        }
    });

    if (!res.ok)
        throw new Error(`Failed to download installer: ${res.status} ${res.statusText}`);

    writeFileSync(ETAG_FILE, res.headers.get("etag") ?? "");

    if (process.platform === "darwin") {
        console.log("[Bleeds] Saving zip...");
        const zip = new Uint8Array(await res.arrayBuffer());
        writeFileSync(downloadName, zip);

        console.log("[Bleeds] Extracting bundle...");
        execSync(`ditto -x -k '${downloadName}' '${FILE_DIR}'`);

        console.log("[Bleeds] Removing macOS quarantine...");
        const logAndRun = cmd => {
            console.log("  Running:", cmd);
            try { execSync(cmd); } catch { }
        };
        logAndRun(`sudo xattr -dr com.apple.quarantine '${outputApp}'`);
    } else {
        const body = Readable.fromWeb(res.body);
        await finished(body.pipe(createWriteStream(outputFile, {
            mode: 0o755,
            autoClose: true
        })));
    }

    // Ensure the binary is executable (Linux/macOS)
    if (process.platform !== "win32") {
        try { chmodSync(outputFile, 0o755); } catch { }
    }

    console.log("[Bleeds] Installer downloaded successfully!");
    return outputFile;
}

// ── Check that the build exists ───────────────────────────────────────────────
function checkBuild() {
    const patcherPath = join(BASE_DIR, "dist", "desktop", "patcher.js");
    if (!existsSync(patcherPath)) {
        console.error("\x1b[31m[Bleeds] dist/desktop/patcher.js not found!\x1b[0m");
        console.error("\x1b[33m           Run 'pnpm build' first, then try again.\x1b[0m");
        process.exit(1);
    }
}

// ── Auto-clean old installations ──────────────────────────────────────────────
function cleanOldBleeds() {
    console.log("[Bleeds] Scanning for old installations to clean up...");
    const platform = process.platform;
    const candidates = [];

    if (platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || "";
        for (const channel of ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"]) {
            const base = join(localAppData, channel);
            if (!existsSync(base)) continue;
            try {
                const versions = readdirSync(base)
                    .filter(d => /^app-\d+\.\d+\.\d+$/.test(d));
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

    let cleanedAny = false;

    for (const resourcesDir of candidates) {
        if (!existsSync(resourcesDir)) continue;

        const appDirPath = join(resourcesDir, "app");
        const backupPath = join(resourcesDir, "_app.asar");
        const appAsarPath = join(resourcesDir, "app.asar");

        try {
            let isAppDirCleaned = false;
            let isBackupRestored = false;

            // 1. Remove the app/ folder if it was created by Bleeds Client
            if (existsSync(appDirPath)) {
                let shouldDelete = false;
                try {
                    const pkgFile = join(appDirPath, "package.json");
                    if (existsSync(pkgFile)) {
                        const pkg = JSON.parse(readFileSync(pkgFile, "utf-8"));
                        if (pkg.name === "bleeds-client") {
                            shouldDelete = true;
                        }
                    } else {
                        // app folder without package.json but _app.asar exists — old injector residue
                        if (existsSync(backupPath)) shouldDelete = true;
                    }
                } catch {
                    shouldDelete = true;
                }

                if (shouldDelete) {
                    console.log(`[Bleeds] Removing old app/ folder in: ${resourcesDir}`);
                    rmSync(appDirPath, { recursive: true, force: true });
                    isAppDirCleaned = true;
                    cleanedAny = true;
                }
            }

            // 2. If _app.asar exists, restore the backup to app.asar
            if (existsSync(backupPath)) {
                let isAsarDir = false;
                if (existsSync(appAsarPath)) {
                    try {
                        isAsarDir = statSync(appAsarPath).isDirectory();
                    } catch {}
                }

                if (isAsarDir) {
                    console.log(`[Bleeds] Removing temp app.asar folder in: ${resourcesDir}`);
                    rmSync(appAsarPath, { recursive: true, force: true });
                }

                if (!existsSync(appAsarPath) || isAsarDir) {
                    console.log(`[Bleeds] Restoring _app.asar -> app.asar in: ${resourcesDir}`);
                    renameSync(backupPath, appAsarPath);
                    isBackupRestored = true;
                    cleanedAny = true;
                }
                // If both app.asar (file) and _app.asar exist, leave them alone —
                // _app.asar is the original Discord backup, Equilotl manages it.
            }
        } catch (e) {
            console.error(`[Bleeds] Error cleaning ${resourcesDir}:`, e.message);
        }
    }

    if (cleanedAny) {
        console.log("[Bleeds] Old installations cleaned up successfully!");
    } else {
        console.log("[Bleeds] No old installations found to clean up.");
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────
// Clean up any old Bleeds Client traces first to avoid conflicts
cleanOldBleeds();

// Only check the build for install/repair (not for uninject)
const argStart = process.argv.indexOf("--");
const args = argStart === -1 ? [] : process.argv.slice(argStart + 1);

const isUninstall = args.includes("--uninstall");
if (!isUninstall) {
    checkBuild();
}

const installerBin = await ensureBinary();

const isInstall = args.includes("--install");

if (isInstall) {
    console.log("[Bleeds] Cleaning previous installations (Vencord/Equicord/Bleeds Client)...");
    try {
        const uninstallArgs = ["--uninstall"];
        const branchIdx = args.findIndex(a => a === "-branch" || a === "--branch");
        if (branchIdx !== -1 && branchIdx + 1 < args.length) {
            uninstallArgs.push("-branch", args[branchIdx + 1]);
        }
        const locationIdx = args.findIndex(a => a === "-location" || a === "--location");
        if (locationIdx !== -1 && locationIdx + 1 < args.length) {
            uninstallArgs.push("-location", args[locationIdx + 1]);
        }

        execFileSync(installerBin, uninstallArgs, {
            stdio: "inherit",
            env: {
                ...process.env,
                EQUICORD_USER_DATA_DIR: BASE_DIR,
                EQUICORD_DIRECTORY: join(BASE_DIR, "dist", "desktop"),
                EQUICORD_DEV_INSTALL: "1"
            }
        });
        console.log("[Bleeds] Cleanup complete.");
    } catch {
        console.log("[Bleeds] No previous mod to clean up or cleanup failed.");
    }
}

console.log("[Bleeds] Launching injection...");

try {
    execFileSync(installerBin, args, {
        stdio: "inherit",
        env: {
            ...process.env,
            EQUICORD_USER_DATA_DIR: BASE_DIR,
            EQUICORD_DIRECTORY: join(BASE_DIR, "dist", "desktop"),
            EQUICORD_DEV_INSTALL: "1",
            BLEEDS_DIRECTORY: join(BASE_DIR, "dist", "desktop")
        }
    });
} catch {
    console.error("[Bleeds] Injection error.");
    process.exit(1);
}
