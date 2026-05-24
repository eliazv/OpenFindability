# OpenFindability

Local SEO dashboard connecting Google Search Console and Umami to your Claude Code workflow via MCP.

Track how your web projects are found, spot SEO opportunities, and query live analytics data from any Claude Code session — without building a SaaS or a heavy monorepo.

## What it does

- **Local Next.js dashboard** — visualize GSC + Umami data for all your projects
- **MCP server** — call live GSC and Umami data from any Claude Code project as a native tool
- **SEO opportunities** — automated detection of low-CTR queries, striking distance keywords, cannibalization, and more
- **File-backed storage** — single JSON file, no database
- **Demo data** — seed and explore without real credentials

## Quick start

```bash
pnpm install
pnpm seed:demo
pnpm dev
```

Open `http://localhost:3000`.

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

## Configure real connectors

Copy `.env.example` to `.env` and fill the values you need.

**Google Search Console** — use a Google service account with access to your Search Console property. Put the JSON file under `secrets/google/`.

```env
GOOGLE_SERVICE_ACCOUNT_FILE=./secrets/google/search-console-service-account.json
```

or inline:

```env
GOOGLE_SERVICE_ACCOUNT_JSON={...}
```

**Umami:**

```env
UMAMI_BASE_URL=https://api.umami.is/v1
UMAMI_API_KEY=...
```

Then add projects via the MCP `create_project` tool or edit `data/openfindability.json` directly.

## Useful commands

```bash
pnpm run doctor       # check connector config
pnpm seed:demo        # seed demo data
pnpm run sync         # sync all connectors
pnpm run sync:gsc     # sync GSC only
pnpm run sync:umami   # sync Umami only
pnpm typecheck
pnpm build
```

## Sync behavior

v0.1 uses manual sync only.

- GSC imports the last 30 days by default (Search Console data has ~2 day delay).
- Umami imports yesterday.
- Every import keeps `rawJson`.
- Connector runs are logged to `connectorRuns`.
- Page-level GSC data is stored separately from query-level data.

## Private files

These are intentionally ignored by git:

```
.env
data/openfindability.json
project/           ← per-project reports, context, notes
private-notes/
secrets/
```

See [`docs/operations/sensitive-files.md`](docs/operations/sensitive-files.md) for details.

## License

MIT
