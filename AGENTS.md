# AGENTS.md

Rules and orientation for any coding agent working in this repo. `CLAUDE.md` only imports this file, so this is the single place to edit.

This file stays short on purpose. The depth (API quirks, storage shapes, dedupe keys, known limitations, why things are the way they are) lives in [`docs/reference/implementation-notes.md`](docs/reference/implementation-notes.md), grouped by topic. Read the section for the area you are about to change.

## Purpose

OpenFindability is a local, self-hosted tool for deciding what to improve across the owner's web projects and mobile apps: it pulls search, analytics, download and revenue data from the platforms into one SQLite file, derives SEO opportunities, and writes reports.

It is a single Next.js app in the repository root, with manual sync only. Do not introduce a monorepo, SaaS billing, auth, queues, a server process or cron scheduling unless explicitly requested.

## Structure

- `app/`: Next.js App Router pages and route handlers (home dashboard, `project/[slug]`, `api/sync`, `api/doctor`).
- `components/ui/`: shadcn/ui primitives. `components/charts/`: client chart components that receive pre-computed props.
- `lib/connectors/`: one file per external API (GSC, GA4, Umami, Play Console, Play vitals, Play GCS stats, App Store Connect, RevenueCat, AdMob, AdSense, RespectASO).
- `lib/sync.ts`: orchestrates connectors and upserts their rows. `lib/store.ts`: `readData`/`writeData` over SQLite.
- `lib/db/schema.ts`, `lib/db/client.ts`, `drizzle/`: Drizzle schema, connection, and committed migrations.
- `lib/insights.ts`, `lib/report.ts`, `lib/analytics/`: all aggregation, opportunity scoring and report rendering.
- `lib/integrations/sheets-export.ts` + `integrations/google-sheets-gsc/`: Google Sheets export and the Apps Script GSC collector.
- `lib/release.ts`: Android release pipeline.
- `scripts/`: CLI entry points, one per `pnpm run` command. `mcp/server.ts`: MCP server over the same data.
- `tests/`: offline `node:test` suites, no live API calls.
- `docs/guide/`: how-to guides per connector and workflow. `docs/reference/`: implementation notes. `docs/operations/`: sensitive files, rollout notes.
- Ignored by git: `data/` (the database and `data/backups/`), `secrets/` (credentials), `project/<slug>/` (private reports, context, notes), `private-notes/`.

## Commands

Use pnpm. On Windows, pnpm's `--` passthrough mis-quotes extra positional args: call `npx tsx scripts/<name>.ts ...` directly when passing them.

```bash
# Run and check
pnpm dev
pnpm typecheck
pnpm build
pnpm run test:gsc
pnpm run test:reliability
pnpm run test:integrations
pnpm run doctor                     # credentials, data freshness, failed syncs

# Sync (default 30-day window; `npx tsx scripts/sync.ts <source> <days>` for more)
pnpm run sync                       # every source except ASO
pnpm run sync:gsc | sync:ga4 | sync:umami | sync:play-console
pnpm run sync:revenuecat | sync:admob | sync:adsense
pnpm run sync:play-vitals | sync:play-stats | sync:asc-analytics
pnpm run sync:aso                   # opt-in, needs local RespectASO
pnpm run sync:bing | sync:cloudflare-ai | sync:clarity
pnpm run discover:seo-geo           # local mapping preview; --apply to save
pnpm run sync:warehouse             # MotherDuck export preview; --apply to upload
pnpm run report:seo-geo -- <slug>
pnpm run test:seo-geo
pnpm run sync:admob:backfill | sync:adsense:backfill | sync:play-stats:backfill | sync:asc-analytics:backfill

# Reports and exports
pnpm run report -- <slug> <gsc|aso|monetization|growth|asc|index|all>
pnpm run growth:summary
pnpm run store:status
pnpm run sheet:export -- --days 90 [--apply]
pnpm run audit:index [max-urls-per-site] [slug-or-property-filter]
pnpm run research:aso -- --slug <slug>

# Projects and account discovery
pnpm run project:add | project:update -- --slug <slug> [--field value ...]
pnpm run discover:apps
pnpm run gsc:sites | asc:apps | admob:apps | adsense:accounts
pnpm run admob:auth | adsense:auth   # interactive OAuth, needs a browser

# Store listings and releases (all dry-run unless --apply)
pnpm run aso:pull-copy | aso:push-copy -- --slug <slug> --locale it
pnpm run play:pull-copy | play:push-copy -- --slug <slug> --language it-IT
pnpm run asc:experiments -- --slug <slug>
pnpm run release:status -- --slug <slug>
pnpm run release:android -- --slug <slug> [--path <flutter dir>] [--build] [--apply]

# Database
pnpm run db:backup                  # verified snapshot in data/backups/
pnpm run db:generate                # after editing lib/db/schema.ts
pnpm run db:studio
pnpm run audit:secrets
```

## Rules

- Keep it simple. Prefer small server-side functions in `lib/`.
- Never commit secrets or real project metrics. Credentials go in `secrets/` (`secrets/google/`, `secrets/appstoreconnect/`, `secrets/android/<slug>/`) and `.env`. Update `.env.example` when adding an env var.
- Preserve `rawJson` on every imported record and log every connector run in `connectorRuns`.
- Aggregation lives in `lib/`, never in client components: the data must stay usable from scripts, reports and agents without the web UI.
- Anything that writes to an external platform (store listings, releases, the Google Sheet) is dry-run by default and only acts with `--apply`.
- Run `pnpm run db:backup` before a historical backfill or any risky change against the real database.
- After editing `lib/db/schema.ts`, run `pnpm run db:generate` and commit the new `drizzle/` files. Never renumber or edit a migration that may already be applied to a database.
- When asked to analyse a project, write a dated report under `project/<slug>/reports/`. Scratch notes go in `private-notes/`, not `docs/`.
- New UI primitives are ported shadcn components in `components/ui/`, not hand-rolled CSS.

## Data semantics that are easy to get wrong

- **RevenueCat `revenue`** is a rolling 28-day window: never sum it across dates, use the latest snapshot. `mrr` and `activeSubscribers` are point-in-time gauges. There is no backfill, history only builds from syncing regularly.
- **AdMob `revenue`** is a true daily total and is safe to sum. Mediation earnings (`admobMediationMetrics`) are the complete total; the network report is only a fallback for days without mediation data. Never add the two together, and never sum amounts in different or missing currencies.
- **GA4 users** summed per day are not unique users for the period. GA4 and Umami stay separate.
- **GSC detail rows** are daily only when `rawJson._openfindability.grain` is `"day"`. Older rows are range aggregates dated with their end date: they stay in the database for audit but must not feed rankings, trends or opportunities (`lib/gsc-detail.ts`). GSC returns top rows, not an exhaustive query inventory.
- **App Store downloads** count first-time downloads only. Rows before 2025-09-21 are inflated and cannot be re-fetched.
- **Play installs** come only from the monthly CSV export in Cloud Storage, and Play vitals lag about 5 days.
- Sync upserts by key, so re-running it is idempotent. ASO `appKeywords` is the one append-only table.

## Documentation

- This file: rules, structure, commands. Change it only when one of those changes.
- `docs/reference/implementation-notes.md`: add implementation detail for a new feature under the matching topic heading, in the same change that ships it. Describe how it works now; leave dates and history to git.
- `docs/guide/`: user-facing how-to for a connector or workflow. Start from `operating-playbook.md` for a full research-to-publish session.

Guides by area: GSC index audit `gsc-index-audit.md` · GA4 `ga4-setup.md` · Google Sheets and Apps Script `google-sheets-live-setup.md` · ASO `aso-workflow.md` · monetization `monetization-workflow.md`, `admob-setup.md`, `adsense-setup.md` · App Store Connect `appstoreconnect-workflow.md` · Android releases `release-workflow.md` · MCP server `mcp-server.md` · credentials `docs/operations/sensitive-files.md`.
