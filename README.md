# OpenFindability

Local dashboard that pulls together how your web and app projects are found and how they monetize — Google Search Console, Umami, Google Play Console, ASO keyword research (via a local RespectASO instance), RevenueCat, AdMob (including ad mediation by network) and AdSense — in one place, plus an MCP server so Claude Code can query the same data live from any project.

No SaaS, no monorepo, no server process beyond `next dev`: a local Next.js app backed by a single SQLite file.

## What it does

- **Local dashboard** — sidebar with every project, a homepage overview and a per-project page (SEO, analytics, Play Store reviews, ASO keywords, ad/subscription revenue, opportunities, sync log)
- **SEO opportunities** — automated detection of low-CTR queries, striking-distance keywords, cannibalization, declining/growing pages, and more
- **ASO research** — keyword popularity/difficulty/opportunity scoring via a local RespectASO instance, with a reusable cross-project keyword cache
- **App & site monetization** — RevenueCat (MRR, subscribers, trials), AdMob (in-app ad revenue, impressions, clicks, per-ad-network mediation breakdown, Android + iOS summed per app) and AdSense (site display-ad revenue)
- **MCP server** — call live GSC/Umami data and manage projects from any Claude Code session as native tools
- **SQLite storage** — `data/openfindability.db` via Drizzle ORM, a single local file with full history (no server, no manual setup)
- **Demo data** — seed and explore without any real credentials

## Quick start

```bash
pnpm install
pnpm seed:demo
pnpm dev
```

Open `http://localhost:3000`.

## Guided setup

```bash
pnpm install
cp .env.example .env
pnpm run doctor
pnpm dev
```

Then configure only the connectors you need — every one is optional and independent.

### 1. Add credentials

**Google Search Console / Play Console** use a Google service account JSON file. Put it under `secrets/google/` and point `.env` to it:

```env
GOOGLE_SERVICE_ACCOUNT_FILE=./secrets/google/search-console-service-account.json
```

**Umami** only needs the API base URL and key:

```env
UMAMI_BASE_URL=https://api.umami.is/v1
UMAMI_API_KEY=...
```

**RespectASO** is optional and local:

```env
RESPECT_ASO_BASE_URL=http://localhost
```

**RevenueCat** uses a V2 secret key:

```env
REVENUECAT_API_KEY=sk_xxx
```

**AdMob** needs interactive OAuth2 (no service account support) — see [`docs/guide/admob-setup.md`](docs/guide/admob-setup.md) for the full walkthrough:

```bash
pnpm run admob:auth   # one-time, mints ADMOB_REFRESH_TOKEN (needs a real browser)
pnpm run admob:apps   # lists every AdMob app id on the account
```

**AdSense** (site display-ad revenue, distinct from AdMob's in-app ads) also needs interactive OAuth2 — see [`docs/guide/adsense-setup.md`](docs/guide/adsense-setup.md):

```bash
pnpm run adsense:auth       # one-time, mints ADSENSE_REFRESH_TOKEN (needs a real browser)
pnpm run adsense:accounts   # lists AdSense account ids
```

### 2. Add a project

```bash
pnpm run project:add -- \
  --name "Example Site" \
  --slug example-site \
  --type web \
  --url https://example.com/ \
  --gsc sc-domain:example.com
```

For an app with ASO research and monetization:

```bash
pnpm run project:add -- \
  --name "Example App" \
  --slug example-app \
  --type app \
  --app-store-track-id 1234567890 \
  --respect-aso-app-id 3 \
  --aso-countries it \
  --aso-keywords "main keyword,secondary keyword" \
  --revenuecat-project-id proj_xxx \
  --admob-app-id ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy \
  --admob-app-id-ios ca-app-pub-xxxxxxxxxxxxxxxx~zzzzzzzzzz
```

For a website with AdSense ads instead of/alongside an app:

```bash
pnpm run project:add -- \
  --name "Example Blog" \
  --slug example-blog \
  --type web \
  --url https://example.com/ \
  --adsense-domain example.com
```

### 3. Sync or research

```bash
pnpm run sync           # sync GSC/Umami/Play Console/RevenueCat/AdMob/AdSense for every project
pnpm run sync:aso       # import configured RespectASO keywords (opt-in, rate-limited)
pnpm run report -- example-app all
```

For store listing research that combines RespectASO with GSC query language:

```bash
pnpm run research:aso -- \
  --slug example-app \
  --gsc-slug example-site \
  --url-contains example.com/app \
  --query-contains "main keyword" \
  --keywords "main keyword,secondary keyword,online,offline"
```

Research reports are written to `project/<slug>/reports/`, which is ignored by git. ASO keyword observations are also cached in the database, so later research can reuse recent `keyword + country` results across projects. Use `--refresh` to force a new RespectASO lookup.

## MCP server — use from any Claude Code project

OpenFindability exposes an MCP server so Claude Code can query your analytics live from any repo.

### Setup (once)

Install tsx globally:

```bash
npm install -g tsx
```

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "openfindability": {
      "command": "tsx",
      "args": ["/absolute/path/to/OpenFindability/mcp/server.ts"]
    }
  }
}
```

On Windows use the full path to `tsx.cmd`:

```json
{
  "mcpServers": {
    "openfindability": {
      "command": "C:\\Users\\<user>\\AppData\\Roaming\\npm\\tsx.cmd",
      "args": ["C:\\path\\to\\OpenFindability\\mcp\\server.ts"]
    }
  }
}
```

Restart Claude Code. The server starts automatically — no process to keep running.

### Available tools

| Tool | Description |
|------|-------------|
| `list_projects` | List configured projects and their slugs |
| `get_project_summary` | Live GSC + Umami + opportunities in one call |
| `get_gsc_stats` | Live GSC data: clicks, impressions, top queries, top pages |
| `get_umami_stats` | Live Umami visitors and pageviews for a date |
| `get_page_keywords` | All GSC queries ranking for a specific page URL |
| `compare_periods` | Compare current vs previous period with deltas |
| `get_opportunities` | SEO opportunities from last sync |
| `list_gsc_properties` | GSC properties accessible to the service account |
| `create_project` | Add a new project (also creates its folder structure) |
| `update_project` | Update project fields |
| `delete_project` | Remove a project and all its data |

Live tools (`get_gsc_stats`, `get_umami_stats`, `get_project_summary`, `get_page_keywords`, `compare_periods`) call the APIs in real time — no sync needed.

See [`docs/guide/mcp-server.md`](docs/guide/mcp-server.md) for full setup and usage.

## Useful commands

```bash
pnpm run doctor           # check connector config, flag stale syncs
pnpm seed:demo            # seed demo data
pnpm dev                  # start the dashboard
pnpm run sync             # sync gsc/umami/play_console/revenuecat/admob/adsense for every project
pnpm run sync:aso         # sync ASO keywords (opt-in)
pnpm run sync:admob:backfill    # one-time full AdMob history backfill (~4 years)
pnpm run sync:adsense:backfill  # one-time full AdSense history backfill (~4 years)
pnpm run admob:auth       # one-time AdMob OAuth2 setup
pnpm run admob:apps       # list AdMob app ids on the account
pnpm run adsense:auth     # one-time AdSense OAuth2 setup
pnpm run adsense:accounts # list AdSense account ids
pnpm run research:aso -- --slug <project-slug>
pnpm run report -- <slug> <gsc|aso|monetization|all>
pnpm run db:studio        # open Drizzle Studio (local GUI SQL browser)
pnpm run db:generate      # regenerate migrations after editing lib/db/schema.ts
pnpm typecheck
pnpm build
```

## Sync behavior

v0.1 uses manual sync only.

- GSC imports the last 30 days by default (Search Console data has ~2 day delay), plus device/country/searchAppearance breakdowns and sitemap status.
- Umami, AdMob, AdSense and RevenueCat import yesterday's data (with a configurable backfill window for AdMob/AdSense).
- ASO stays opt-in (`pnpm run sync:aso`) — rate-limited and cached upstream, so it never runs as part of the default `pnpm run sync`.
- Every import keeps `rawJson`. Connector runs are logged to `connectorRuns`.
- Re-running a sync the same day replaces that day's row per project/source instead of duplicating it — different days accumulate, so history is preserved.
- Page-level GSC data is stored separately from query-level data.

## Storage

All data lives in `data/openfindability.db`, a local SQLite database accessed through Drizzle ORM (`lib/db/schema.ts`). No server process, no extra infra — still a single local file, just relational and queryable (`pnpm run db:studio`) instead of a hand-rolled JSON blob.

## Private files

These are intentionally ignored by git:

```
.env
data/                ← openfindability.db (+ WAL/journal files)
project/             ← per-project reports, context, notes
private-notes/
secrets/
```

See [`docs/operations/sensitive-files.md`](docs/operations/sensitive-files.md) for details.

## License

MIT
