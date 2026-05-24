# OpenFindability

OpenFindability is an open-source dashboard for monitoring how your web projects are found through Google Search Console and Umami.

The first goal is simple: show what needs attention this week, without building a complex SaaS or heavy monorepo too early.

## v0.1 scope

- Local Next.js app.
- File-backed JSON storage.
- Demo data.
- Manual sync.
- Google Search Console connector.
- Umami connector.
- SEO opportunities.
- Doctor command.
- MIT license.

## Quick start

```bash
pnpm install
pnpm seed:demo
pnpm dev
```

Open `http://localhost:3000`.

## Useful commands

```bash
pnpm run doctor
pnpm seed:demo
pnpm run sync
pnpm run sync:gsc
pnpm run sync:umami
pnpm typecheck
pnpm build
```

## Configure real connectors

Copy `.env.example` to `.env` and fill the values you need.

For Google Search Console, use a Google service account with access to the Search Console property.
Put the JSON file under `secrets/google/`.

```txt
GOOGLE_SERVICE_ACCOUNT_FILE=./secrets/google/search-console-service-account.json
```

or:

```txt
GOOGLE_SERVICE_ACCOUNT_JSON={...}
```

For Umami:

```txt
UMAMI_BASE_URL=https://api.umami.is/v1
UMAMI_API_KEY=...
```

Then edit the projects inside `data/openfindability.json` or seed demo data and replace the project fields:

```json
{
  "gscProperty": "sc-domain:example.com",
  "umamiWebsiteId": "your-website-id"
}
```

Private files are intentionally ignored:

- `.env`
- `data/openfindability.json`
- `docs/`
- `secrets/`
- `sensibili/`

See `docs/operations/sensitive-files.md` for the local file layout.

## Sync behavior

v0.1 uses manual sync only.

- GSC imports the last 30 days by default, ending two days ago because Search Console data is delayed.
- Umami imports yesterday.
- Every import keeps `rawJson`.
- Connector status is written to `connectorRuns`.
- Page-level GSC data is stored separately from query-level data.

No cron, hosted scheduler or background worker is included yet.

## License

MIT
