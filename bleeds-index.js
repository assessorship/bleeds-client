"use strict";
const path = require("path");
const Module = require("module");
const fs = require("fs");
const { app } = require("electron");

const bleedsData = path.join(app.getPath("appData"), "Bleeds Client");
app.setPath("userData", bleedsData);

app.setAppUserModelId("com.squirrel.Discord.Discord");

app.commandLine.appendSwitch("disable-features", "WebRtcHideLocalIpsWithMdns");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");

const BLOCKED_MODULES = new Set(["discord_rpc", "discord_dispatch", "discord_erinn"]);

app.once("ready", () => {
    try {
        const { session } = require("electron");
        app.once("browser-window-created", () => {
            try {
                session.defaultSession.webRequest.onBeforeRequest(
                    { urls: ["https://discord.com/api/modules/*"] },
                    (details, callback) => {
                        let blocked = false;
                        for (const m of BLOCKED_MODULES) if (details.url.includes(m)) { blocked = true; break; }
                        callback(blocked ? { cancel: true } : {});
                    }
                );
            } catch (e) {
                console.warn("[Bleeds Client] Module filter failed:", e.message);
            }
        });
    } catch (e) {
        console.warn("[Bleeds Client] Ready hook failed:", e.message);
    }
});

try {
    const lsPath = path.join(bleedsData, "Local Storage", "leveldb");
    if (fs.existsSync(lsPath)) {
        const lockFile = path.join(lsPath, "LOCK");
        let corrupted = false;
        if (fs.existsSync(lockFile)) {
            try { const fd = fs.openSync(lockFile, "r+"); fs.closeSync(fd); }
            catch { try { fs.unlinkSync(lockFile); } catch { } corrupted = true; }
        }
        if (!corrupted) {
            for (const f of fs.readdirSync(lsPath).filter(f => f.endsWith(".ldb"))) {
                if (fs.statSync(path.join(lsPath, f)).size === 0) { corrupted = true; break; }
            }
        }
        if (corrupted) {
            try { fs.rmSync(lsPath, { recursive: true, force: true }); } catch { }
        }
    }
} catch (e) { console.warn("[Bleeds Client] LevelDB check failed:", e.message); }

function addGlobalPath(p) {
    try { if (fs.existsSync(p) && !Module.globalPaths.includes(p)) Module.globalPaths.push(p); } catch { }
}

function scanModuleDir(base) {
    try {
        for (const mod of fs.readdirSync(base)) {
            const modDir = path.join(base, mod);
            if (!fs.existsSync(modDir) || !fs.statSync(modDir).isDirectory()) continue;
            addGlobalPath(modDir);
            for (const sub of fs.readdirSync(modDir)) {
                const subDir = path.join(modDir, sub);
                if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) addGlobalPath(subDir);
            }
        }
    } catch { }
}

const bundledModulesPath = path.join(path.dirname(process.execPath), "modules");
const moduleDataPath = path.join(app.getPath("appData"), "discord", "module_data");
const discordLocalBase = path.join(app.getPath("appData"), "..", "Local", "Discord");

let discordNativeModulesPath = null;
try {
    const entries = fs.readdirSync(discordLocalBase)
        .filter(e => e.startsWith("app-"))
        .map(e => ({ name: e, full: path.join(discordLocalBase, e, "modules") }))
        .filter(e => fs.existsSync(e.full))
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
    if (entries.length > 0) discordNativeModulesPath = entries[0].full;
} catch { }

addGlobalPath(bundledModulesPath);
if (discordNativeModulesPath) { addGlobalPath(discordNativeModulesPath); scanModuleDir(discordNativeModulesPath); }
scanModuleDir(bundledModulesPath);
addGlobalPath(moduleDataPath);
scanModuleDir(moduleDataPath);

const _globalPathsSet = new Set(Module.globalPaths);
const _addedParents = new WeakSet();
const _origResolve = Module._resolveLookupPaths;
Module._resolveLookupPaths = function (request, parent) {
    if (parent && !_addedParents.has(parent)) {
        _addedParents.add(parent);
        if (!parent.paths?.length) parent.paths = [..._globalPathsSet];
        else for (const p of _globalPathsSet) if (!parent.paths.includes(p)) parent.paths.push(p);
    }
    return _origResolve.call(this, request, parent);
};

const coreModuleDir = path.join(bundledModulesPath, "discord_desktop_core-1", "discord_desktop_core");
const coreModuleDirNative = discordNativeModulesPath
    ? path.join(discordNativeModulesPath, "discord_desktop_core-1", "discord_desktop_core")
    : null;
global.mainAppDirname = fs.existsSync(coreModuleDir)
    ? coreModuleDir
    : (coreModuleDirNative && fs.existsSync(coreModuleDirNative))
        ? coreModuleDirNative
        : path.join(moduleDataPath, "discord_desktop_core");

try {
    const buildInfoPath = path.join(path.dirname(process.execPath), "resources", "build_info.json");
    const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf-8"));
    const nativeModulesDir = path.join(path.dirname(process.execPath), "modules");
    if (fs.existsSync(nativeModulesDir) && !buildInfo.localModulesRoot) {
        buildInfo.localModulesRoot = nativeModulesDir;
        fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
    }
} catch (e) {
    console.warn("[Bleeds Client] build_info.json patch failed:", e.message);
}

require(path.join(__dirname, "dist", "desktop", "patcher.js"));
