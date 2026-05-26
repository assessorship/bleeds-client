# Bleeds Sync — Server Setup (5 minutes, completely free)

## What this does
A tiny Cloudflare Worker that stores Bleeds Client user profiles (display name + badge)
so all users with the mod can see each other's custom data.

---

## Step 1 — Create a Cloudflare account
Go to https://dash.cloudflare.com/sign-up — it's free, no card needed.

---

## Step 2 — Create the KV namespace
1. In the Cloudflare dashboard, go to **Workers & Pages → KV**
2. Click **Create namespace**
3. Name it `BLEEDS_SYNC`
4. Copy the **Namespace ID** shown (looks like `abc123def456...`)

---

## Step 3 — Configure wrangler.toml
Open `wrangler.toml` and replace `REPLACE_WITH_YOUR_KV_ID` with the ID you copied.

---

## Step 4 — Deploy
```bash
cd tools/sync-worker
npm install
npm run deploy
```

Wrangler will ask you to log into Cloudflare. After that, it deploys in seconds.
Your Worker URL will be printed: `https://bleeds-sync.YOUR-USERNAME.workers.dev`

---

## Step 5 — Configure the plugin
1. Open Discord → Settings → Plugins → bleedsSync
2. Paste your Worker URL into **Sync server URL**
3. Set your **Display name** and **Badge** (emoji like 🔥 or an image URL)
4. Click **Sync Profile Now**

Done! Other Bleeds Client users will see your custom name and badge.

---

## How it works

- **On startup**: the plugin downloads all registered profiles (~instant, tiny JSON)
- **Every 5 minutes**: re-fetches to pick up new users
- **On profile change**: clicking "Sync Profile Now" pushes your data
- **Display names**: shown instead of Discord name in messages, popouts, DMs
- **Badges**: appear next to your name in profiles (hover to see tooltip)

The server stores: `{ discordUserId: { displayName, badge, badgeText, updatedAt } }`
No passwords, no tokens, no personal data beyond what you explicitly set.
