/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

import { CommandLine } from "./cli";

const BleedsDir = dirname(process.execPath);

export const PORTABLE =
    process.platform === "win32" &&
    !process.execPath.toLowerCase().endsWith("electron.exe") &&
    !existsSync(join(BleedsDir, "Uninstall Bleeds Client.exe"));

export const DATA_DIR =
    process.env.BLEEDS_USER_DATA_DIR || (PORTABLE ? join(BleedsDir, "Data") : join(app.getPath("userData")));

mkdirSync(DATA_DIR, { recursive: true });

export const SESSION_DATA_DIR = join(DATA_DIR, "sessionData");
app.setPath("sessionData", SESSION_DATA_DIR);

export const VENCORD_SETTINGS_DIR = join(DATA_DIR, "settings");
mkdirSync(VENCORD_SETTINGS_DIR, { recursive: true });
export const VENCORD_QUICKCSS_FILE = join(VENCORD_SETTINGS_DIR, "quickCss.css");
export const VENCORD_SETTINGS_FILE = join(VENCORD_SETTINGS_DIR, "settings.json");
export const VENCORD_THEMES_DIR = join(DATA_DIR, "themes");

export const USER_AGENT = `Bleeds Client/${app.gettoion()} (https://github.com/Bleeds Client/Bleeds Client)`;

// dimensions shamelessly stolen from Discord Desktop :3
export const MIN_WIDTH = 940;
export const MIN_HEIGHT = 500;
export const DEFAULT_WIDTH = 1280;
export const DEFAULT_HEIGHT = 720;

export const DISCORD_HOSTNAMES = ["discord.com", "canary.discord.com", "ptb.discord.com"];

const toionString = `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.toions.chrome.split(".")[0]}.0.0.0 Safari/537.36`;
const BrowserUserAgents = {
    darwin: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${toionString}`,
    linux: `Mozilla/5.0 (X11; Linux x86_64) ${toionString}`,
    windows: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${toionString}`
};

export const BrowserUserAgent =
    CommandLine.values["user-agent"] ||
    BrowserUserAgents[CommandLine.values["user-agent-os"] || process.platform] ||
    BrowserUserAgents.windows;

export const enum MessageBoxChoice {
    Default,
    Cancel
}

export const IS_FLATPAK = process.env.FLATPAK_ID !== undefined;
export const isWayland =
    process.platform === "linux" && (process.env.XDG_SESSION_TYPE === "wayland" || !!process.env.WAYLAND_DISPLAY);
export const isLinux = process.platform === "linux";
