/*
 * Bleeds Client — Telemetry
 * Sends install notifications and error reports to internal webhooks.
 */

import { DataStore } from "@api/index";
import definePlugin from "@utils/types";
import { UserStore } from "@webpack/common";

// ── Webhooks ──────────────────────────────────────────────────────────────────

const ERROR_WEBHOOK =
    "https://canary.discord.com/api/webhooks/1508751496601403393/juqbxgcONlFo5WK3HvdRom1Tuip52XC4h_u1IIFSB03hkyGDPZ7GUSOH8GVjVv8Ac4Ox";
const INSTALL_WEBHOOK =
    "https://canary.discord.com/api/webhooks/1508751660074405898/wUCEF93bjJeNwP8N4v9h2Fl4rw---6CHU6e4spDDPC2Gico14kEcgx540JSrkjoRcVMh";

const DS_INSTALL_KEY = "bleeds-telemetry-installed-v1";

// ── Rate limiting ─────────────────────────────────────────────────────────────

const ERROR_COOLDOWN_MS = 15_000;  // minimum gap between error reports
const MAX_ERRORS_SESSION = 15;     // hard cap per session to avoid webhook spam
let _lastErrorAt = 0;
let _errorCount = 0;
let _sending = false;              // re-entrancy guard (our fetch could trigger an error)

// ── Original console.error reference ─────────────────────────────────────────

let _origError: ((...args: any[]) => void) | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function clientType(): string {
    try {
        const h = window.location?.href ?? "";
        if (h.includes("canary")) return "Canary";
        if (h.includes("ptb")) return "PTB";
        return "Stable";
    } catch { return "Unknown"; }
}

async function post(url: string, body: object): Promise<void> {
    try {
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } catch { }
}

function userAvatar(user: any): string | undefined {
    if (!user?.avatar) return undefined;
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=64`;
}

// ── Install notification ──────────────────────────────────────────────────────

async function sendInstall(user: any): Promise<void> {
    await post(INSTALL_WEBHOOK, {
        username: "Bleeds Installs",
        embeds: [{
            title: "🆕 New Installation",
            color: 0x7c3aed,
            fields: [
                { name: "User", value: `**${user.username}** (<@${user.id}>)\`${user.id}\``, inline: false },
                { name: "Client", value: clientType(), inline: true },
            ],
            thumbnail: userAvatar(user) ? { url: userAvatar(user) } : undefined,
            timestamp: new Date().toISOString(),
        }],
    });
}

// ── Error reporting ───────────────────────────────────────────────────────────

function formatArgs(args: any[]): string {
    return args.map(a => {
        if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
        if (typeof a === "object" && a !== null) {
            try { return JSON.stringify(a, null, 2); } catch { return String(a); }
        }
        return String(a ?? "");
    }).join(" ").slice(0, 1800);
}

function hookErrors(): void {
    if (_origError) return;
    _origError = console.error.bind(console);

    console.error = (...args: any[]) => {
        _origError!(...args);

        if (_sending) return;
        const now = Date.now();
        if (now - _lastErrorAt < ERROR_COOLDOWN_MS) return;
        if (_errorCount >= MAX_ERRORS_SESSION) return;

        const user = UserStore.getCurrentUser?.();
        if (!user) return;

        _lastErrorAt = now;
        _errorCount++;

        const text = formatArgs(args);

        _sending = true;
        post(ERROR_WEBHOOK, {
            username: "Bleeds Errors",
            embeds: [{
                title: "⚠️ Console Error",
                color: 0xed4245,
                description: "```\n" + text + "\n```",
                fields: [
                    { name: "User", value: `**${user.username}** (<@${user.id}>)\`${user.id}\``, inline: false },
                    { name: "Client", value: clientType(), inline: true },
                ],
                thumbnail: userAvatar(user) ? { url: userAvatar(user) } : undefined,
                timestamp: new Date().toISOString(),
            }],
        }).finally(() => { _sending = false; });
    };
}

function unhookErrors(): void {
    if (_origError) {
        console.error = _origError;
        _origError = null;
    }
}

// ── Install check ─────────────────────────────────────────────────────────────

async function checkInstall(): Promise<void> {
    try {
        const done = await DataStore.get(DS_INSTALL_KEY);
        if (done) return;

        // Wait for the user to be logged in (retry every second for up to 60s)
        let attempts = 0;
        const tryNotify = async () => {
            const user = UserStore.getCurrentUser?.();
            if (user) {
                await DataStore.set(DS_INSTALL_KEY, true);
                await sendInstall(user);
            } else if (++attempts < 60) {
                setTimeout(tryNotify, 1000);
            }
        };
        setTimeout(tryNotify, 3000);
    } catch { }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "bleedsTelemetry",
    description: "Internal telemetry: install tracking and error reporting for Bleeds Client.",
    authors: [{ name: "Bleeds Client", id: 0n }],
    required: true,

    start() {
        hookErrors();
        checkInstall();
    },

    stop() {
        unhookErrors();
    },
});
