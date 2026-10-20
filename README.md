# Axite business models

Internal, password-protected website for tweaking Axite's business model. Several saved dashboards (research & pharma route, direct to consumer, combined), each with editable customers, plans, cost lines and funding rounds. Every change is saved on the server with version history, so you continue where you left off on any device.

## Run locally

```
APP_PASSWORD=choose-a-password SESSION_SECRET=any-long-random-string npm start
```

Open http://localhost:3000. No dependencies to install: it uses Node 22's built-in SQLite. `npm test` runs the engine and API checks.

## Deploy on Railway

1. In Railway, **New project → Deploy from GitHub repo** and pick this repository. The `Dockerfile` and `railway.json` are picked up automatically.
2. Open the service → **Variables** and add:
   - `APP_PASSWORD` – the shared password everyone uses.
   - `SESSION_SECRET` – a long random string (for example the output of `openssl rand -hex 32`). Changing it logs everyone out.
   - `NODE_ENV` = `production` (set by the Dockerfile; marks the cookie `Secure`).
3. Open the service → **Volumes → Add volume**, mount path `/data`. The app writes its database to the volume automatically (it reads `RAILWAY_VOLUME_MOUNT_PATH`). Without a volume the data is lost on every deploy.
4. **Settings → Networking → Generate domain** (or attach your own). Done.

Each push to the branch Railway follows redeploys the app. The three starting dashboards are only created the first time the database is empty; later deploys keep your numbers.

## What the model does

- **Customers** buy a **plan**. Revenue = customers × units per customer × price (× 12 for monthly plans), from the start year you choose. Each plan has a cost to deliver and payment terms (months between invoice and cash).
- **Cost lines** have a category and a type: € per month, € per year, € one-off, % of revenue, or FTE × monthly cost per FTE. Add as many as you need; they appear in the P&L and in the cost chart by category.
- **Funding** lines land in a chosen month. Opening cash is the balance on 1 January of the first year.
- **Corporate tax** is applied to positive results, after carried-forward losses when that option is on.
- The verdict, the KPIs, the "What the numbers say" block and the explanatory text under each card are all generated from the numbers.
- Drag the ⋮⋮ handle to reorder cards, table rows and result blocks. The order is saved. With the keyboard: focus a handle and press the arrow keys.
- **History** keeps a version at most every 20 minutes while you edit, plus any version you save by hand. Restore any of them; "Reset to starting numbers" restores the version created with the dashboard.
- **Export / Import** moves a dashboard as a JSON file.

## Files

- `server/server.js` – HTTP server, login, API. No framework.
- `server/db.js` – SQLite storage (dashboards, snapshots).
- `server/seeds.js` – the three starting dashboards.
- `public/model.js` – the calculation engine and the generated sentences; shared by browser and tests.
- `public/dashboard.js`, `public/overview.js`, `public/dnd.js` – the pages.
