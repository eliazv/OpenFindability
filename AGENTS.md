# AGENTS.md

## Project purpose

OpenFindability is a lightweight self-hosted dashboard for deciding what to improve across web projects.

The v0.1 scope is intentionally simple:

- Next.js app in the repository root.
- Local SQLite storage in `data/openfindability.db`, accessed through Drizzle ORM (`lib/db/schema.ts`/`lib/db/client.ts`).
- Google Search Console and Umami connectors.
- Local RespectASO connector for ASO research.
- RevenueCat and AdMob connectors for app monetization stats.
- Manual sync only.
- SEO opportunities from imported metrics.

Do not introduce a monorepo, SaaS billing, auth, queues, cron scheduling or MCP unless explicitly requested.

## Structure

- `app/`: Next.js App Router pages and route handlers.
- `components/ui/`: shadcn/ui primitives (Tailwind v4, `cn` helper in `lib/utils.ts`), ported from the Wiloo project's design system (which itself already used Kiranism's `next-shadcn-dashboard-starter` patterns, including `chart.tsx`).
- `components/charts/`: dashboard chart components (Recharts via `components/ui/chart.tsx`), e.g. `admob-revenue-chart.tsx`, `revenuecat-mrr-chart.tsx`, `metric-trend-chart.tsx` (generic GSC/Umami trend chart). Client components (`"use client"`); data is computed server-side in `lib/insights.ts` and passed in as props.
- `app/project/[slug]/page.tsx`: per-project dashboard, a grid of cards (one per data source) that reads the same `lib/insights.ts`/`lib/report.ts` aggregates as the homepage, scoped to one project.
- `components/app-sidebar.tsx` + `components/ui/sidebar.tsx`: project navigation sidebar (Kiranism/shadcn `Sidebar` primitive), listing all projects with links to their per-project dashboard.
- `lib/`: store, connectors, sync logic, insights and shared types.
- `lib/db/schema.ts`: Drizzle `sqliteTable` definitions (one per `AppData` array, mirroring `lib/types.ts`).
- `lib/db/client.ts`: opens `data/openfindability.db` (WAL + foreign keys pragmas) and runs migrations on module load.
- `drizzle/`: `drizzle-kit`-generated migration SQL, committed to git (schema history, not runtime data).
- `scripts/`: CLI-like commands for local development.
- `scripts/migrate-json-to-sqlite.ts`: one-time importer from the legacy `data/openfindability.json` into SQLite.
- `docs/`: public project documentation.
- `project/`: private per-project reports, context and notes, ignored by git.
- `private-notes/`: private scratch folder, ignored by git.
- `data/`: local runtime data (`openfindability.db` + WAL/journal files), ignored except `.gitkeep`.
- `secrets/`: local credentials, ignored by git.

## Commands

Use pnpm.

```bash
pnpm install
pnpm seed:demo
pnpm dev
pnpm run doctor
pnpm run sync
pnpm run sync:aso
pnpm run sync:revenuecat
pnpm run sync:admob
pnpm run admob:auth
pnpm run research:aso -- --slug <project-slug>
pnpm run db:generate
pnpm run db:studio
pnpm run db:migrate-json
pnpm typecheck
pnpm build
```

## Rules

- Keep v0.1 simple.
- Preserve `rawJson` for imported API payloads.
- Write connector results to `connectorRuns`.
- Keep page-level GSC metrics separate from query-level metrics.
- GSC sync (`lib/connectors/gsc.ts`) also fetches device/country/searchAppearance breakdowns (one `searchanalytics.query` call per dimension, aggregated over the whole synced date range — not daily) into `gscDimensionBreakdowns`, and sitemap status (`sitemaps.list`) into `gscSitemaps`. Both are upserted (`upsertBreakdowns`/`upsertSitemaps` in `lib/sync.ts`) keyed on `(projectId, rangeStart, rangeEnd, dimension, key)` and `(projectId, path)` respectively. `buildGscReportMarkdown` renders them as extra "Breakdowns"/"Sitemaps" sections when present. GSC's public API has no bulk index-coverage/crawl-error report — only per-URL URL Inspection — so that data still requires manual checks in the Search Console UI.
- GSC report Trend section: same pattern as the ASO Trend section, but compares `pageMetrics` (not `appKeywords`) between the two most recent snapshot dates for the project, matched by page URL (clicks/impressions/avg position delta via the shared `formatDelta` helper).
- Keep ASO keyword snapshots reusable across projects in `asoKeywordSnapshots`.
- Keep app-specific ASO ranks separate in `asoAppRankSnapshots`.
- RevenueCat/AdMob are third-party API connectors, same pattern as GSC/Umami/Play Console — not the prohibited "SaaS billing/auth/queues" category. See `docs/guide/monetization-workflow.md`.
- RevenueCat's `revenue` snapshot field is a rolling 28-day window, not a true daily total — never sum across dates, only use the latest snapshot per project. AdMob's `revenue` snapshot field is a true daily total, safe to sum across dates/projects.
- Do not commit secrets or real project metrics.
- Keep private scratch notes in `private-notes/`, not in `docs/`.
- When asked to inspect or reason about a project, create/update `project/<project-slug>/reports/` and write a dated report there.
- Service account JSON files belong in `secrets/google/`.
- Update `.env.example` when adding env vars.
- Prefer small server-side functions in `lib/`.
- Update `AGENTS.md` and `CLAUDE.md` whenever changing project workflow, commands, storage shape or conventions.
- Document every new feature in `CLAUDE.md` (and here if it affects rules/structure) in the same change that introduces it.
- ASO report Trend section: `buildAsoReportMarkdown` (`lib/report.ts`) compares the two most recent `appKeywords` snapshot dates per project, showing rank/opportunity/popularity delta; only rendered when 2+ dates exist.
- Dashboard charts (`components/charts/`, `components/ui/chart.tsx`) are a presentation layer only — they read the same `lib/insights.ts` aggregates as everything else. Never move data fetching/aggregation into a client component; keep it in server-side functions so the data stays scriptable/queryable outside the web UI (CLI, `pnpm run report`, AI agents reading `lib/` directly).
- `lib/insights.ts`'s `getAdmobRevenueTrend`/`getRevenueCatMrrTrend` dedupe `metricSnapshots` by `(projectId, date)` (keeping the latest `createdAt`) before summing across projects, as a safety net for any data synced before the dedupe-on-insert fix below.
- `lib/sync.ts` upserts on insert (`upsertByKey`/`upsertSnapshots`/`upsertQueries`/`upsertPages`): re-running `pnpm run sync` the same day replaces existing `metricSnapshots`/`searchQueries`/`pageMetrics` rows sharing the same key instead of appending duplicates. `appReviews` keeps its own `reviewId` dedupe; `appKeywords` (ASO) stays append-only.
- Monetization report: `buildMonetizationReportMarkdown` (`lib/report.ts`), written by `pnpm run report -- <slug> monetization` (or `all`) to `project/<slug>/reports/<date>-monetization-data.md`. Mirrors the GSC/ASO report pattern; skipped when the project has neither `admobAppId` nor `revenueCatProjectId` configured.
- Per-project dashboard (`app/project/[slug]/page.tsx`): each card (GSC, Umami, AdMob, RevenueCat, top pages/queries, ASO keywords, Play Store/reviews, opportunities, sync log) is rendered only when that project actually has data for that source — hidden entirely otherwise (no "not configured" placeholder, unlike the homepage's Monetizzazione cards). The sidebar (`components/app-sidebar.tsx`) lists every project and links to its dashboard; both are presentation only, reading the same `lib/insights.ts`/`lib/report.ts` server-side aggregates.
- Storage is SQLite (`better-sqlite3` + `drizzle-orm`/`drizzle-kit`), not a hand-rolled JSON file — but `lib/store.ts`'s public API (`readData`/`writeData`/`updateData`/`getDataFilePath`) is unchanged, so this is invisible to every other module. `writeData()` wipes and bulk-reinserts every table inside one `db.transaction(...)`, matching the old "overwrite the whole file" semantics since every caller builds the full `AppData` object in memory before a single `writeData()` call. `readData()` normalizes SQL `NULL` back to `undefined` to match `AppData`'s optional-field types (except `appRank`, which is genuinely nullable and kept as `null`).
- `next.config.ts` sets `serverExternalPackages: ["better-sqlite3"]` so the native addon isn't bundled by Turbopack.
- `lib/insights.ts`/`lib/report.ts` still aggregate over the full in-memory `AppData` blob from `readData()`, not SQL `GROUP BY`/`SUM` — switching them to real SQL aggregation is a valid future step, not required by this migration.
- `mcp/server.ts` does not use the `db`/`readData`/`writeData` singletons from `lib/db/client.ts`/`lib/store.ts` directly — it runs via `tsx` with an arbitrary cwd from other repos, so it builds its own `AppDb` with `createDb(dbFilePath, migrationsFolder)` (paths resolved from `import.meta.url`, not `process.cwd()`) and calls `readDataWith(database)`/`writeDataWith(database, data)` against it. Both `createDb` and `readDataWith`/`writeDataWith` exist specifically to support this cross-repo use case alongside the main app's cwd-based singletons.
- Pre-existing, unrelated to storage: `mcp/server.ts`'s `@/lib/...` path aliases only resolve under `tsx` when the process cwd is the OpenFindability repo itself, so the documented any-repo invocation (`docs/guide/mcp-server.md`) currently only works when the host's cwd happens to be this repo. Not fixed as part of the SQLite migration.
