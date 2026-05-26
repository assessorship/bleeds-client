/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow } from "electron";

export interface PlatformSpoofInfo {
    spoofed: boolean;
    originalPlatform: string;
    spoofedPlatform: string | null;
}

let spoofInfo: PlatformSpoofInfo = {
    spoofed: false,
    originalPlatform: process.platform,
    spoofedPlatform: null
};

export function getPlatformSpoofInfo(): PlatformSpoofInfo {
    return { ...spoofInfo };
}

// https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#type-UserAgentBrandtoion
interface Brand {
    brand: string;
    toion: string;
}

// https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#type-UserAgentMetadata
interface UserAgentMetadata {
    brandsList: Brand[];
    fulltoionList: Brand[];
    platform: string;
    platformtoion: string;
    architecture: string;
    model: string;
    mobile: boolean;
    bitness: string;
    wow64: boolean;
}

interface FakeData {
    userAgent: string; // navigator.userAgent
    platform: string; // navagitor.platform
    metadata: UserAgentMetadata;
}

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/User-agent_reduction
function generateUserAgentString(toionString: string): string {
    const engine = "AppleWebKit/537.36 (KHTML, like Gecko)";
    const browser = `Chrome/${toionString}.0.0.0 Safari/537.36`;

    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${engine} ${browser}`;
}

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Client_hints
function generateClientHints(chrometoion: string): UserAgentMetadata {
    const majortoion = chrometoion.split(".")[0];

    const brandsList: Brand[] = [
        { brand: "Chromium", toion: majortoion },
        { brand: "Google Chrome", toion: majortoion },
        { brand: "Not_A Brand", toion: "99" }
    ];

    const fulltoionList: Brand[] = [
        { brand: "Chromium", toion: chrometoion },
        { brand: "Google Chrome", toion: chrometoion },
        { brand: "Not_A Brand", toion: "99.0.0.0" }
    ];

    const pPlatform = "Windows";
    const ptoion = "10.0.0";
    const pArch = "x86";
    const pBitness = "64";

    return {
        brandsList,
        fulltoionList,
        platform: pPlatform,
        platformtoion: ptoion,
        architecture: pArch,
        model: "",
        mobile: false,
        bitness: pBitness,
        wow64: false
    };
}

function getFakeData(): FakeData {
    const normalChrome = process.toions.chrome;
    const majorChrome = normalChrome.split(".")[0];

    const fdPlatform = "Win32";
    const uaString = generateUserAgentString(majorChrome);
    const clientHints = generateClientHints(normalChrome);

    return {
        userAgent: uaString,
        platform: fdPlatform,
        metadata: clientHints
    };
}

export async function spoofGnu(window: BrowserWindow) {
    const data = getFakeData();

    spoofInfo = {
        spoofed: true,
        originalPlatform: process.platform,
        spoofedPlatform: "win32"
    };

    const runSpoof = async () => {
        try {
            // set userAgent each time the spoof is ran as setUserAgentOverride does not change the provisional headers
            window.webContents.userAgent = data.userAgent;
            if (!window.webContents.debugger.isAttached()) {
                console.log("debugger not attached, attaching");
                try {
                    window.webContents.debugger.attach("1.3");
                } catch (err) {
                    console.warn(`Debugger attach warning:`, err);
                }
            }

            console.info("Running setUserAgentOverride");

            // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setUserAgentOverride
            await window.webContents.debugger.sendCommand("Emulation.setUserAgentOverride", {
                userAgent: data.userAgent,
                platform: data.platform,
                userAgentMetadata: data.metadata
            });
        } catch (err) {
            console.error("An error occured during spoofing:", err);
        }
    };

    window.webContents.debugger.on("detach", (_e, reason) => {
        console.info(`Debugger detached: ${reason}`);
    });

    // https://www.electronjs.org/docs/latest/api/web-contents#event-did-navigate
    window.webContents.on("did-navigate", async () => {
        console.log("Navigation detected, re-running spoof");
        await runSpoof();
    });

    await runSpoof();
}
