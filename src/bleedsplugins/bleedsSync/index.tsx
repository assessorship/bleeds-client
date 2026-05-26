/*
 * Bleeds Client — Cross-client Profile Sync
 * Shares customProfile data with other Bleeds Client users.
 * TOS notice shown on every startup. No settings panel.
 */

import { addProfileBadge, BadgePosition, ProfileBadge, removeProfileBadge } from "@api/Badges";
import { DataStore } from "@api/index";
import { openModal, ModalRoot, ModalContent, ModalHeader, ModalFooter, ModalSize } from "@utils/modal";
import definePlugin from "@utils/types";
import { Button, FluxDispatcher, React, Text, UserStore } from "@webpack/common";

// ── Constants ──────────────────────────────────────────────────────────────────

const SYNC_URL = "https://bleed-sync.prredictions.workers.dev";
const API_KEY  = "BleedsSync_v1";
const DS_CACHE = "bleeds-sync-cache-v3";
const CP_DS_ALL_DATA = "customProfile_allData";
const CP_DS_KEY      = "customProfile_data";

// ── Badge metadata ─────────────────────────────────────────────────────────────

const FLAG = {
    STAFF: 1, PARTNER: 2, HYPESQUAD: 4, BUG_HUNTER_1: 8,
    BRAVERY: 64, BRILLIANCE: 128, BALANCE: 256, EARLY_SUPPORTER: 512,
    BUG_HUNTER_2: 16384, DEV_VERIFIED: 131072, MOD_ALUMNI: 262144, ACTIVE_DEVELOPER: 4194304,
};

const FLAG_BADGES = [
    { flag: FLAG.STAFF,            label: "Discord Staff",                icon: "https://cdn.discordapp.com/badge-icons/5e74e9b61934fc1f67c65515d1f7e60d.png" },
    { flag: FLAG.PARTNER,          label: "Partnered Server Owner",        icon: "https://cdn.discordapp.com/badge-icons/3f9748e53446a137a052f3454e2de41e.png" },
    { flag: FLAG.HYPESQUAD,        label: "HypeSquad Events",              icon: "https://cdn.discordapp.com/badge-icons/bf01d1073931f921909045f3a39fd264.png" },
    { flag: FLAG.BUG_HUNTER_1,     label: "Bug Hunter Level 1",            icon: "https://cdn.discordapp.com/badge-icons/2717692c7dca7289b35297368a940dd0.png" },
    { flag: FLAG.BRAVERY,          label: "HypeSquad Bravery",             icon: "https://cdn.discordapp.com/badge-icons/8a88d63823d8a71cd5e390baa45efa02.png" },
    { flag: FLAG.BRILLIANCE,       label: "HypeSquad Brilliance",          icon: "https://cdn.discordapp.com/badge-icons/011940fd013da3f7fb926e4a1cd2e618.png" },
    { flag: FLAG.BALANCE,          label: "HypeSquad Balance",             icon: "https://cdn.discordapp.com/badge-icons/3aa41de486fa12454c3761e8e223442e.png" },
    { flag: FLAG.EARLY_SUPPORTER,  label: "Early Supporter",               icon: "https://cdn.discordapp.com/badge-icons/7060786766c9c840eb3019e725d2b358.png" },
    { flag: FLAG.BUG_HUNTER_2,     label: "Bug Hunter Level 2",            icon: "https://cdn.discordapp.com/badge-icons/848f79194d4be5ff5f81505cbd0ce1e6.png" },
    { flag: FLAG.DEV_VERIFIED,     label: "Early Verified Bot Developer",  icon: "https://cdn.discordapp.com/badge-icons/6df5892e0f35b051f8b61eace34f4967.png" },
    { flag: FLAG.MOD_ALUMNI,       label: "Moderator Programs Alumni",     icon: "https://cdn.discordapp.com/badge-icons/fee1624003e2fee35cb398e125dc479b.png" },
    { flag: FLAG.ACTIVE_DEVELOPER, label: "Active Developer",              icon: "https://cdn.discordapp.com/badge-icons/6bdc42827a38498929a4920da12695d9.png" },
];

const NITRO_ICONS = [
    "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png",
    "https://cdn.discordapp.com/badge-icons/4f33c4a9c64ce221936bd256c356f91f.png",
    "https://cdn.discordapp.com/badge-icons/4514fab914bdbfb4ad2fa23df76121a6.png",
    "https://cdn.discordapp.com/badge-icons/2895086c18d5531d499862e41d1155a6.png",
    "https://cdn.discordapp.com/badge-icons/0334688279c8359120922938dcb1d6f8.png",
    "https://cdn.discordapp.com/badge-icons/0d61871f72bb9a33a7ae568c1fb4f20a.png",
    "https://cdn.discordapp.com/badge-icons/11e2d339068b55d3a506cff34d3780f3.png",
    "https://cdn.discordapp.com/badge-icons/cd5e2cfd9d7f27a8cdcd3e8a8d5dc9f4.png",
    "https://cdn.discordapp.com/badge-icons/5b154df19c53dce2af92c9b61e6be5e2.png",
];

const BOOST_ICONS = [
    "https://cdn.discordapp.com/badge-icons/51040c70d4f20a921ad6674ff86fc95c.png",
    "https://cdn.discordapp.com/badge-icons/0e4080d1d333bc7ad29ef6528b6f2fb7.png",
    "https://cdn.discordapp.com/badge-icons/72bed924410c304dbe3d00a6e593ff59.png",
    "https://cdn.discordapp.com/badge-icons/df199d2050d3ed4ebf84d64ae83989f8.png",
    "https://cdn.discordapp.com/badge-icons/996b3e870e8a22ce519b3a50e6bdd52f.png",
    "https://cdn.discordapp.com/badge-icons/991c9f39ee33d7537d9f408c3e53141e.png",
    "https://cdn.discordapp.com/badge-icons/cb3ae83c15e970e8f3d410bc62cb8b99.png",
    "https://cdn.discordapp.com/badge-icons/7142225d31238f6387d9f09efaa02759.png",
    "https://cdn.discordapp.com/badge-icons/ec92202290b48d0879b7413d2dde3bab.png",
];

const OLD_NAME_ICON = "https://cdn.discordapp.com/badge-icons/6de6d34650760ba5551a79732e98ed60.png";

// ── Module-level state ─────────────────────────────────────────────────────────

const profileCache: Record<string, any> = {};
let syncBadge: ProfileBadge | null = null;
let fetchInterval: ReturnType<typeof setInterval> | null = null;
let uploadInterval: ReturnType<typeof setInterval> | null = null;
let _fetchCount = 0;
let _userStoreHooked = false;
let _avatarHooked = false;
let _dsPatched = false;
let _syncStarted = false;
let _tosBannerEl: HTMLDivElement | null = null;
let _lastMissCacheRefetch = 0; // rate-limits re-fetch when uncached user is viewed

// ── Read customProfile data from DataStore (IndexedDB) ─────────────────────────

async function readCustomProfileDataAsync(userId: string): Promise<Record<string, any> | null> {
    try {
        const allData = await DataStore.get(CP_DS_ALL_DATA) as Record<string, any> | null;
        if (allData && typeof allData === "object") {
            const entry = allData[userId];
            if (entry && typeof entry === "object" && Object.keys(entry).length > 0) return entry;
        }
    } catch { }

    try {
        const single = await DataStore.get(CP_DS_KEY) as Record<string, any> | null;
        if (single && typeof single === "object" && Object.keys(single).length > 0) return single;
    } catch { }

    try {
        const rawAll = localStorage.getItem("BleedsCP_allData");
        if (rawAll) {
            const all = JSON.parse(rawAll);
            const entry = all[userId];
            if (entry && typeof entry === "object" && Object.keys(entry).length > 0) return entry;
        }
        const rawSingle = localStorage.getItem("BleedsCP_data");
        if (rawSingle) {
            const entry = JSON.parse(rawSingle);
            if (entry && typeof entry === "object" && Object.keys(entry).length > 0) return entry;
        }
    } catch { }

    return null;
}

// ── Upload ALL customProfile fields to sync server ─────────────────────────────

async function uploadProfile(): Promise<void> {
    const me = UserStore.getCurrentUser();
    if (!me) throw new Error("Not logged in");

    const cp = await readCustomProfileDataAsync(me.id);
    const payload: Record<string, any> = { userId: me.id };

    if (cp) {
        // Upload every field from customProfile — recipient uses whatever is present
        Object.assign(payload, cp);
        payload.userId = me.id; // always keep userId intact
    }

    console.log("[bleedsSync] uploading:", payload);

    const res = await fetch(`${SYNC_URL}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bleeds-Key": API_KEY },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    console.log("[bleedsSync] upload OK");
}

async function fetchProfiles(): Promise<void> {
    const res = await fetch(`${SYNC_URL}/profiles`);
    if (!res.ok) { console.warn("[bleedsSync] fetch failed", res.status); return; }

    const data: Record<string, any> = await res.json();
    Object.keys(profileCache).forEach(k => delete profileCache[k]);
    Object.assign(profileCache, data);

    console.log("[bleedsSync] fetched", Object.keys(data).length, "profiles:", Object.keys(data));

    DataStore.set(DS_CACHE, data).catch(() => { });
    refreshBadge();
}

async function registerPresence(): Promise<void> {
    const me = UserStore.getCurrentUser();
    if (!me) throw new Error("Not logged in");
    const res = await fetch(`${SYNC_URL}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bleeds-Key": API_KEY },
        body: JSON.stringify({ userId: me.id }),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
}

function registerWithRetry() {
    registerPresence().catch(() => {
        setTimeout(() => registerPresence().catch(() => {
            setTimeout(() => registerPresence().catch(() => { }), 30_000);
        }), 15_000);
    });
}

function uploadWithRetry() {
    uploadProfile().catch(() => {
        setTimeout(() => {
            uploadProfile().catch(() => {
                setTimeout(() => uploadProfile().catch(() => { }), 30_000);
            });
        }, 15_000);
    });
}

function tryBeginSync() {
    if (_syncStarted) return;
    _syncStarted = true;
    beginSync();
}

function beginSync() {
    fetchProfiles().catch(() => { });
    uploadWithRetry();

    // Burst-fetch at 30s and 90s after start to catch users who registered just after us
    setTimeout(() => fetchProfiles().catch(() => { }), 30_000);
    setTimeout(() => fetchProfiles().catch(() => { }), 90_000);

    if (!fetchInterval) {
        fetchInterval = setInterval(() => {
            fetchProfiles().catch(() => { });
            _fetchCount++;
            if (_fetchCount % 6 === 0) uploadProfile().catch(() => { });
        }, 5 * 60_000);
    }

    // Upload every 60s to catch customProfile saves that bypass DataStore intercept
    if (!uploadInterval) {
        uploadInterval = setInterval(() => uploadProfile().catch(() => { }), 60_000);
    }
}

// ── Badge rendering ────────────────────────────────────────────────────────────

function DefaultBCBadge() {
    return (
        <span
            style={{
                fontSize: 11, fontWeight: 700, lineHeight: 1,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
                color: "#fff", borderRadius: 4, padding: "2px 4px",
                cursor: "default", userSelect: "none",
            }}
            title="Bleeds Client User"
        >
            BC
        </span>
    );
}

function buildBadgesForUser(userId: string): any[] {
    const p = profileCache[userId];
    if (!p) {
        // User not in cache yet — trigger a background re-fetch (at most once per 15s)
        if (_syncStarted) {
            const now = Date.now();
            if (now - _lastMissCacheRefetch > 15_000) {
                _lastMissCacheRefetch = now;
                fetchProfiles().catch(() => { });
            }
        }
        return [];
    }

    const style = { borderRadius: "50%", width: "22px", height: "22px" };
    const badges: any[] = [];

    // Discord flag badges
    const flags = p.badgeFlags ?? 0;
    if (flags) {
        for (const b of FLAG_BADGES) {
            if (flags & b.flag) {
                badges.push({ description: b.label, iconSrc: b.icon, key: `bcs-${userId}-flag-${b.flag}`, props: { style } });
            }
        }
    }

    // Nitro badge (only when nitro simulation is on and a level is set)
    const nl = p.nitroLevel ?? -1;
    const nitroOn = p.nitro !== false; // respect the nitro boolean if present
    if (nl >= 0 && nl < NITRO_ICONS.length && nitroOn) {
        badges.push({ description: "Discord Nitro", iconSrc: NITRO_ICONS[nl], key: `bcs-${userId}-nitro`, props: { style } });
    }

    // Server Boost badge
    const bm = p.boostMonths ?? -1;
    if (bm >= 0 && bm < BOOST_ICONS.length) {
        badges.push({ description: "Server Booster", iconSrc: BOOST_ICONS[bm], key: `bcs-${userId}-boost`, props: { style } });
    }

    // Special custom badges
    const customIds: string[] = p.customBadgeIds ?? [];
    if (customIds.includes("quest")) {
        badges.push({ description: "Completed a Quest", iconSrc: "https://cdn.discordapp.com/badge-icons/7d9ae358c8c5e118768335dbe68b4fb8.png", key: `bcs-${userId}-quest`, props: { style } });
    }
    if (customIds.includes("orbs")) {
        badges.push({ description: "Orbs — Apprentice", iconSrc: "https://cdn.discordapp.com/badge-icons/83d8a1eb09a8d64e59233eec5d4d5c2d.png", key: `bcs-${userId}-orbs`, props: { style } });
    }
    if (customIds.includes("oldname")) {
        const tip = p.oldName ? `Old username: ${p.oldName}` : "Old username";
        badges.push({ description: tip, iconSrc: OLD_NAME_ICON, key: `bcs-${userId}-oldname`, props: { style } });
    }

    // Fallback: show BC badge if no other badges configured
    if (badges.length === 0) {
        badges.push({ description: "Bleeds Client User", key: `bcs-${userId}-bc`, component: () => <DefaultBCBadge /> });
    }

    return badges;
}

function refreshBadge() {
    if (syncBadge) removeProfileBadge(syncBadge);

    syncBadge = {
        position: BadgePosition.END,
        getBadges({ userId }) {
            const myId = UserStore.getCurrentUser?.()?.id;
            if (userId === myId) return [];
            return buildBadgesForUser(userId);
        },
    };

    addProfileBadge(syncBadge);
}

// ── UserStore hook — display name ─────────────────────────────────────────────

function hookUserStore() {
    if (_userStoreHooked) return;
    try {
        const WP = (window as any).Vencord?.Webpack;
        const US = WP?.findByProps?.("getCurrentUser", "getUser");
        if (!US || US._bleeds_sync_v3) return;

        const prev = US.getUser.bind(US);
        US.getUser = (id: string) => {
            const user = prev(id);
            if (!user) return user;
            const myId = UserStore.getCurrentUser?.()?.id;
            if (!myId || id === myId) return user;
            const synced = profileCache[id];
            const name = synced?.globalName || synced?.displayName;
            if (!name) return user;
            const copy = Object.create(Object.getPrototypeOf(user));
            Object.assign(copy, user);
            copy.globalName = name;
            copy.displayName = name;
            return copy;
        };

        US._bleeds_sync_v3 = true;
        _userStoreHooked = true;
    } catch (e) {
        console.warn("[bleedsSync] UserStore hook failed:", e);
    }
}

// ── IconUtils hook — custom avatar ────────────────────────────────────────────

function hookAvatarURL() {
    if (_avatarHooked) return;
    try {
        const IU = (window as any).Vencord?.Webpack?.findByProps?.("getUserAvatarURL");
        if (!IU?.getUserAvatarURL || IU._bleeds_sync_avatar) return;

        const orig = IU.getUserAvatarURL.bind(IU);
        IU.getUserAvatarURL = (user: any, ...args: any[]) => {
            const uid = user?.id ?? user?.userId;
            const myId = UserStore.getCurrentUser?.()?.id;
            if (uid && uid !== myId) {
                const synced = profileCache[uid];
                if (synced?.avatar) return synced.avatar;
            }
            return orig(user, ...args);
        };

        IU._bleeds_sync_avatar = true;
        _avatarHooked = true;
    } catch (e) {
        console.warn("[bleedsSync] Avatar hook failed:", e);
    }
}

// ── TOS Banner — shown every startup, auto-dismisses after 25s ────────────────

function showTosBanner() {
    try {
        if (_tosBannerEl || document.getElementById("bleeds-tos-banner")) return;
        const el = document.createElement("div");
        el.id = "bleeds-tos-banner";
        el.setAttribute("style", [
            "position:fixed", "top:0", "left:0", "right:0", "z-index:2147483647",
            "background:linear-gradient(90deg,#5865f2,#7c3aed)", "color:#fff",
            "padding:10px 16px", "display:flex", "align-items:center", "gap:12px",
            "font-size:13px", "font-family:sans-serif", "box-shadow:0 2px 8px rgba(0,0,0,.5)",
            "line-height:1.4",
        ].join(";"));
        el.innerHTML = [
            "<span style='flex:1'>",
            "<strong>Bleeds Client Sync</strong> — Your profile (badges, name, avatar) is synced to other Bleeds Client users. ",
            "Data shared: Discord user ID, display name, avatar, and Custom Profile badges.",
            "</span>",
            "<button id='bleeds-tos-close' style='background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);",
            "color:#fff;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:12px;flex-shrink:0'>OK</button>",
        ].join("");
        (document.body ?? document.documentElement).appendChild(el);
        _tosBannerEl = el;
        document.getElementById("bleeds-tos-close")?.addEventListener("click", () => { hideTosBanner(); });
    } catch (e) {
        console.error("[bleedsSync] showTosBanner error:", e);
    }
}

function hideTosBanner() {
    _tosBannerEl?.remove();
    _tosBannerEl = null;
    document.getElementById("bleeds-tos-banner")?.remove();
}

// ── TOS Modal — shown every startup after Discord connects ────────────────────

let _modalShown = false;

function openTosModal(onAgree: () => void) {
    if (_modalShown) return;
    _modalShown = true;
    try {
        openModal(props => (
            <ModalRoot {...props} size={ModalSize.SMALL}>
                <ModalHeader>
                    <Text variant="heading-lg/semibold">Bleeds Client — Sync Notice</Text>
                </ModalHeader>
                <ModalContent>
                    <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
                        <Text variant="text-md/normal">
                            Bleeds Client automatically syncs your profile with other Bleeds Client users.
                        </Text>
                        <Text variant="text-md/normal">The following data is shared:</Text>
                        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                            <li><Text variant="text-sm/normal">Your Discord user ID</Text></li>
                            <li><Text variant="text-sm/normal">Custom Profile data: display name, avatar, badges</Text></li>
                        </ul>
                        <Text variant="text-sm/normal" style={{ color: "var(--text-muted)" }}>
                            No passwords or tokens are collected.
                        </Text>
                    </div>
                </ModalContent>
                <ModalFooter>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
                        <Button color={Button.Colors.RED} size={Button.Sizes.SMALL} onClick={() => { props.onClose(); hideTosBanner(); }}>
                            Decline
                        </Button>
                        <Button color={Button.Colors.BRAND} size={Button.Sizes.SMALL} onClick={() => { props.onClose(); hideTosBanner(); onAgree(); }}>
                            I Agree
                        </Button>
                    </div>
                </ModalFooter>
            </ModalRoot>
        ));
    } catch (e) {
        console.warn("[bleedsSync] openTosModal error:", e);
    }
}

// ── Plugin ─────────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "bleedsSync",
    description: "Shares your Custom Profile (badges, name, avatar) with other Bleeds Client users in real time.",
    authors: [{ name: "Bleeds Client", id: 0n }],
    required: true,

    async start() {
        console.log("[bleedsSync] start() called — version 5");

        showTosBanner();
        // Auto-dismiss TOS banner after 25s
        setTimeout(() => hideTosBanner(), 25_000);

        (window as any).__bleedsSync = { cache: profileCache, upload: uploadProfile, fetch: fetchProfiles };

        const cached = await DataStore.get(DS_CACHE) as Record<string, any> | null;
        if (cached && typeof cached === "object") Object.assign(profileCache, cached);

        refreshBadge();
        hookUserStore();
        hookAvatarURL();

        // Intercept DataStore.set to upload when customProfile saves
        if (!_dsPatched) {
            _dsPatched = true;
            try {
                const origSet = DataStore.set.bind(DataStore);
                // Use Object.defineProperty since 'set' may be a read-only getter
                Object.defineProperty(DataStore, "set", {
                    value: async (key: string, value: any) => {
                        const result = await origSet(key, value);
                        if (key === CP_DS_ALL_DATA || key === CP_DS_KEY) {
                            setTimeout(() => uploadProfile().catch(() => { }), 800);
                        }
                        return result;
                    },
                    configurable: true,
                    writable: true,
                });
                console.log("[bleedsSync] DataStore.set intercepted OK");
            } catch (e) {
                console.warn("[bleedsSync] DataStore.set intercept failed, relying on interval:", e);
            }
        }

        registerWithRetry();

        // Reset modal gate so it shows again on this startup
        _modalShown = false;

        // Start sync after Discord connects (or 8s fallback) — no TOS gate
        let _started = false;
        const startOnce = () => {
            if (_started) return;
            _started = true;
            hideTosBanner();
            tryBeginSync();
        };
        try {
            const h = () => {
                try { FluxDispatcher.unsubscribe("CONNECTION_OPEN", h); } catch { }
                // Show modal 1.5s after connection, then start sync regardless
                setTimeout(() => openTosModal(startOnce), 1500);
                // Fallback: start sync after 12s even if modal is not acted on
                setTimeout(startOnce, 12000);
            };
            FluxDispatcher.subscribe("CONNECTION_OPEN", h);
        } catch { }
        // Hard fallback if CONNECTION_OPEN never fires
        setTimeout(startOnce, 20000);
    },

    stop() {
        if (fetchInterval) { clearInterval(fetchInterval); fetchInterval = null; }
        if (uploadInterval) { clearInterval(uploadInterval); uploadInterval = null; }
        if (syncBadge) { removeProfileBadge(syncBadge); syncBadge = null; }
        _fetchCount = 0;
        _syncStarted = false;
        _modalShown = false;
        _lastMissCacheRefetch = 0;
        hideTosBanner();
    },
});
