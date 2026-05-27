# Word Stars ⭐ — Setup Guide

## What's in this folder
- `index.html` — the full app (kid game + parent dashboard)
- `api/notion.js` — Vercel serverless function (Notion proxy)
- `vercel.json` — Vercel routing config
- `SETUP.md` — this guide

---

## Step 1 — Get your Notion API key

1. Go to `notion.so/my-integrations` (log in with email + password)
2. Click **New integration** → name it "Word Stars App"
3. Select your workspace → click **Save**
4. Copy the **Internal Integration Token** (starts with `secret_...`)

---

## Step 2 — Share databases with the integration

1. Open your **🎮 Kids Learning App** page in Notion
2. Click the `···` menu at the top right of the page
3. Click **Connections** → find "Word Stars App" → connect
4. This gives the app access to all 6 databases underneath

---

## Step 3 — Add your Notion key to index.html

Open `index.html` and find this line near the top of the `<script>` section:

```javascript
const PARENT_PIN = '9999';   // change this to your own PIN!
```

This is the only thing you need to change in the code itself.
The Notion key goes into Vercel as an environment variable (Step 5).

Also update `PARENT_PIN` to your own 4-digit number.

---

## Step 4 — Deploy to Vercel

1. Go to `vercel.com` — sign up free with your non-Google email
2. Click **Add New Project**
3. Choose **Deploy from your local project** (or drag-and-drop the folder)
4. Upload this entire `kidsapp` folder
5. **Before clicking Deploy** — go to **Environment Variables** and add:
   - Key: `NOTION_KEY`
   - Value: your `secret_...` token from Step 1
6. Click **Deploy** ✅

You'll get a URL like `https://wordstars-abc123.vercel.app`

---

## Step 5 — Bookmark on iPad

1. Open Safari on iPad
2. Go to your Vercel URL
3. Tap the Share button → **Add to Home Screen**
4. Name it "Word Stars" — it appears as an app icon!

---

## Managing word sets

Go to Notion → 📋 Word Sets → add or edit rows.
Set Status to **Active** to use it in the game.
Only one set should be Active at a time — the parent dashboard handles this automatically.

---

## Changing the parent PIN

Open `index.html`, find `const PARENT_PIN = '9999'` and change it.
Then redeploy to Vercel (drag the folder again).

---

## Notion database IDs (already wired up — no action needed)
- Children:    d75f2ae1-c2f5-4500-9c55-c4a3bbb31d3d
- Word Sets:   7e2b728d-212c-463b-883f-819c24a3366c
- Games:       47b86b21-c1aa-4f48-850d-35a9817f28fb
- Sessions:    b4c8af09-235b-4e8b-af0d-0e6781adc90e
- Wallet:      2ebb0e80-b7ef-43d2-a065-6d1408d8de4e
- Redemptions: 047bda4c-9db0-4e90-90a5-2358f91ea260
