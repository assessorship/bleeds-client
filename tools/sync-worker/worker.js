/**
 * Bleeds Client Sync Worker
 * Cloudflare Worker — free tier (100k requests/day)
 *
 * Stores user profiles in Cloudflare KV.
 * Deploy with: npm run deploy
 */

const API_KEY = "BleedsSync_v1";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Bleeds-Key",
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS });
        }

        const url = new URL(request.url);

        // ── GET /profiles ─────────────────────────────────────────────────────
        // Returns all registered user profiles.
        // Called by clients on startup and every 5 minutes.
        if (url.pathname === "/profiles" && request.method === "GET") {
            const data = await env.BLEEDS_SYNC.get("all", "json") ?? {};
            return json(data);
        }

        // ── POST /profile ─────────────────────────────────────────────────────
        // Upsert the caller's profile.
        // Body: { userId, displayName?, badge?, badgeText? }
        if (url.pathname === "/profile" && request.method === "POST") {
            if (request.headers.get("X-Bleeds-Key") !== API_KEY) {
                return json({ error: "Unauthorized" }, 403);
            }

            let body;
            try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
            if (!body?.userId || typeof body.userId !== "string") {
                return json({ error: "Missing userId" }, 400);
            }

            const all = await env.BLEEDS_SYNC.get("all", "json") ?? {};
            all[body.userId] = {
                displayName: typeof body.displayName === "string" ? body.displayName : null,
                badge:       typeof body.badge === "string"       ? body.badge       : null,
                badgeText:   typeof body.badgeText === "string"   ? body.badgeText   : "Bleeds Client",
                updatedAt:   Date.now(),
            };
            await env.BLEEDS_SYNC.put("all", JSON.stringify(all));
            return json({ ok: true });
        }

        // ── DELETE /profile ───────────────────────────────────────────────────
        // Remove a user's profile entry.
        // Body: { userId }
        if (url.pathname === "/profile" && request.method === "DELETE") {
            if (request.headers.get("X-Bleeds-Key") !== API_KEY) {
                return json({ error: "Unauthorized" }, 403);
            }

            let body;
            try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
            if (!body?.userId) return json({ error: "Missing userId" }, 400);

            const all = await env.BLEEDS_SYNC.get("all", "json") ?? {};
            delete all[body.userId];
            await env.BLEEDS_SYNC.put("all", JSON.stringify(all));
            return json({ ok: true });
        }

        return json({ error: "Not found" }, 404);
    },
};
