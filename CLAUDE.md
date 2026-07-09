# CLAUDE.md

OpenFindability v0.1 is a simple local Next.js app, not a monorepo.

Current goal:

```txt
Google Search Console + Umami + projects + manual sync + SEO opportunities.
ASO research uses local RespectASO and reusable local keyword cache.
RevenueCat + AdMob connectors for app monetization stats.
```

Avoid adding advanced architecture before the base product is useful.

Useful commands:

```bash
pnpm seed:demo
pnpm dev
pnpm run doctor
pnpm run sync
pnpm run sync:aso
pnpm run sync:revenuecat
pnpm run sync:admob
pnpm run admob:auth
pnpm run admob:apps
pnpm run research:aso -- --slug <project-slug>
pnpm run db:generate
pnpm run db:studio
pnpm run db:migrate-json
pnpm typecheck
pnpm build
```

Important implementation notes:

- Data lives in `data/openfindability.db`, a local SQLite database accessed through Drizzle ORM (`better-sqlite3` driver). WAL journal mode and `foreign_keys = ON` are set at connection time in `lib/db/client.ts`.
- Runtime data is ignored by git.
- Public docs live in `docs/`.
- Private project files live in `project/<project-slug>/` with subfolders: `reports/`, `context/`, `notes/`.
- Dated project analysis reports belong in `project/<project-slug>/reports/`.
- Private scratch notes live in `private-notes/` and are ignored by git.
- Service account JSON files live in `secrets/google/`.
- GSC backfill defaults to 30 days.
- GSC sync also pulls device/country/searchAppearance breakdowns (aggregated over the whole synced range, not daily) into `gscDimensionBreakdowns`, plus sitemap status (`sitemaps.list`) into `gscSitemaps`. The GSC report (`buildGscReportMarkdown`) renders these as extra sections when present. GSC's public API has no bulk index-coverage/crawl-error endpoint (only per-URL URL Inspection), so those still require manual checking in the Search Console UI.
- The GSC report includes a Trend section (mirrors the ASO one) comparing page-level metrics between the two most recent `pageMetrics` snapshot dates per project (clicks/impressions/avg position delta), shown only when at least two dates exist. `formatDelta` (`lib/report.ts`) takes an optional `decimals` option so position deltas round to 1 decimal instead of showing long floats; ASO's integer scores are unaffected (default `decimals: 0`).
- Umami sync imports yesterday.
- Keep `rawJson` on imported records.
- Store connector run logs.
- Do not add SaaS-specific code yet.
- ASO data comes from a local RespectASO instance (not SaaS); see `docs/guide/aso-workflow.md`.
- Configure `asoKeywords`/`asoCountries`/`appStoreTrackId`/`respectAsoAppId` per project when needed.
- ASO keyword metrics are cached in `asoKeywordSnapshots` for reuse across projects.
- App-specific ASO ranks are cached separately in `asoAppRankSnapshots`.
- `pnpm run research:aso` writes reports to `project/<slug>/reports/` and can reuse cache unless `--refresh` is passed.
- The ASO report (`buildAsoReportMarkdown` in `lib/report.ts`) includes a Trend section comparing the two most recent `appKeywords` snapshot dates per project (rank/opportunity/popularity delta), shown only when at least two dates exist.
- RevenueCat and AdMob connectors (`lib/connectors/revenuecat.ts`, `lib/connectors/admob.ts`) are third-party API connectors, not SaaS-specific code — they follow the same pattern as GSC/Umami/Play Console; see `docs/guide/monetization-workflow.md`.
- Configure `revenueCatProjectId`/`admobAppId` per project when needed.
- RevenueCat auth is a V2 secret key (`REVENUECAT_API_KEY`, Bearer token), not OAuth.
- AdMob auth is interactive OAuth2 (`ADMOB_CLIENT_ID`/`ADMOB_CLIENT_SECRET`/`ADMOB_REFRESH_TOKEN`/`ADMOB_PUBLISHER_ID`); mint the refresh token once via `pnpm run admob:auth` run on your own machine (needs a real browser).
- RevenueCat's `revenue` snapshot field (`revenue_last_28_days`) is a rolling window, not a true daily total — never sum it across dates, only use the latest snapshot per project. AdMob's `revenue` snapshot field is a true daily total and is safe to sum across dates/projects.
- RevenueCat/AdMob sync as part of default `pnpm run sync` (like gsc/umami/play_console); ASO stays opt-in only (`pnpm run sync:aso`).
- When changing commands, workflow, storage shape or folder conventions, update both `AGENTS.md` and `CLAUDE.md`.
- Every new feature must be documented here (and in `AGENTS.md` if it affects rules/structure) in the same change that introduces it.
- UI uses Tailwind v4 + a small set of shadcn/ui primitives (`components/ui/`: button, card, badge, table, separator, chart), styled to match the same design tokens used in the Wiloo project (`components.json`, `lib/utils.ts` cn helper). Add new shadcn primitives the same way (copy + adapt import paths) instead of hand-rolling CSS classes.
- Charts use Recharts (`^2.15.4`, pinned to match the Kiranism `next-shadcn-dashboard-starter` template Wiloo's design system was ported from) via the `components/ui/chart.tsx` primitive (`ChartContainer`/`ChartConfig`/`ChartTooltip`/`ChartTooltipContent`). Theme colors come from the existing `--chart-1`..`--chart-5` CSS variables in `app/globals.css` — no new theming needed. Dashboard-specific chart components live in `components/charts/` (e.g. `admob-revenue-chart.tsx`, `revenuecat-mrr-chart.tsx`), are `"use client"`, and only receive pre-computed data as props — `app/page.tsx` stays an async Server Component.
- `lib/insights.ts` exposes `getAdmobRevenueTrend(data, days)` and `getRevenueCatMrrTrend(data, days)` for chart data: both dedupe `metricSnapshots` by `(projectId, date)` (latest `createdAt` wins) before summing across projects per date, since sync does not dedupe on insert. AdMob's daily `revenue` is safe to sum this way; RevenueCat's `mrr`/`activeSubscribers` are point-in-time gauges (safe to sum across projects on the same date) — only RevenueCat's rolling `revenue` field must never be aggregated like this.
- The home page's "Progetti" table and AdMob/RevenueCat cards now also show a month-over-month/30-day trend badge (plain `Badge`, no icons) computed by `trendPercent`/`formatTrend` helpers in `app/page.tsx`.
- All of the above is presentation only: it reads `lib/insights.ts` aggregates computed from `data/openfindability.json`. Scripts, sync, doctor and reports remain fully usable without the web UI — do not move data logic into client components.
- `pnpm run report -- <slug> monetization` (or `all`) writes a dated `project/<slug>/reports/<date>-monetization-data.md` via `buildMonetizationReportMarkdown` in `lib/report.ts`: AdMob revenue (that day/this month/previous month, true daily sums) and RevenueCat (latest MRR/active subscribers/trials/new customers, rolling 28-day revenue) plus a per-source daily/MRR trend table (last 30 rows). Skipped with a log message if the project has neither `admobAppId` nor `revenueCatProjectId` configured.
- `lib/sync.ts` dedupes on every sync run instead of just appending: `upsertByKey`/`upsertSnapshots`/`upsertQueries`/`upsertPages` replace any existing row sharing the same key (`metricSnapshots`: `projectId::source::date`; `searchQueries`: `projectId::date::query::page`; `pageMetrics`: `projectId::date::page`) with the newly synced one before writing. This makes re-running `pnpm run sync` the same day idempotent instead of piling up duplicate rows that would double-count in reports/insights/charts. Play Console's `appReviews` keeps its own existing `reviewId` dedupe; ASO's `appKeywords` is intentionally left append-only (opt-in, cached upstream).
- App navigation is now a sidebar: `components/ui/sidebar.tsx` is the Kiranism/shadcn `Sidebar` primitive (ported the same way as other `components/ui/*`, depends on new `sheet.tsx`/`tooltip.tsx`/`skeleton.tsx`/`input.tsx` and `hooks/use-mobile.ts`; Radix imports adapted to this project's individual-package convention — `@radix-ui/react-dialog` for Sheet, `@radix-ui/react-tooltip` for Tooltip — not the consolidated `radix-ui` meta-package). `components/app-sidebar.tsx` (`"use client"`) lists every project (type-specific icon) linking to `/project/<slug>`, plus Doctor/Sync manuale shortcuts. `app/layout.tsx` is an async Server Component reading `data.projects` and wrapping `{children}` in `SidebarProvider`/`SidebarInset` — since `SidebarInset` renders `<main>`, page-level wrappers (`app/page.tsx`, `app/project/[slug]/page.tsx`) use a top-level `<div>`, not `<main>`. New `--sidebar*`/`--color-sidebar*` tokens in `app/globals.css` are derived from the existing warm/green oklch palette, not shadcn's neutral defaults.
- Per-project dashboard at `app/project/[slug]/page.tsx`: looks up the project by slug (`notFound()` if missing) and renders a grid of cards, one per data source, scoped to that project. Uses new `getProjectMetricTrend(data, projectId, source, key, days)` in `lib/insights.ts` (single-project counterpart to `getAdmobRevenueTrend`/`getRevenueCatMrrTrend`, reusing the same dedupe/sum helpers) plus the existing `summarizeProject` and `aggregatePagesByUrl`/`aggregateQueriesByText` (`lib/report.ts`). Cards: GSC, Umami, AdMob (reuses `AdmobRevenueChart`), RevenueCat (reuses `RevenueCatMrrChart`), top pages, top queries, ASO keywords (latest `appKeywords` date, sorted by `opportunityScore`), Play Store (latest `play_console` snapshot + recent `appReviews`), opportunities, recent connector runs. Each card is rendered only if that project actually has rows for that source — otherwise it's omitted entirely, unlike the homepage's AdMob/RevenueCat cards which always render with a "not configured yet" hint. GSC/Umami trend charts use new generic `components/charts/metric-trend-chart.tsx` (`MetricTrendChart`, parameterized by `label`/`color`/`valueFormatter`, with a per-instance gradient id to avoid SVG id collisions when several trend charts render on one page).
- Storage moved from a single hand-rolled JSON file to SQLite (via `better-sqlite3` + `drizzle-orm`/`drizzle-kit`), to make the data properly relational/queryable while keeping v0.1 simple (no server process, no extra infra — still a single local file). `lib/db/schema.ts` defines one `sqliteTable` per `AppData` array (same 10 tables/shapes as `lib/types.ts`), with `FOREIGN KEY ... ON DELETE CASCADE` from every project-scoped table to `projects`, plus the same unique/non-unique indexes the old code relied on for dedup keys (e.g. `metric_snapshots_project_source_date`, `search_queries_project_date_query_page`). `lib/db/client.ts` opens `data/openfindability.db`, sets the WAL + foreign-key pragmas, and runs `migrate()` against `./drizzle` at module load — so importing the store still requires zero manual setup, same as the old JSON file. `drizzle.config.ts` (`dialect: "sqlite"`) is `drizzle-kit`'s config for generating migrations from `lib/db/schema.ts`; the generated SQL under `drizzle/` is committed to git (it's schema history, not runtime data), unlike `data/*.db*` which stays gitignored (`.db`, `.db-wal`, `.db-shm`, `.db-journal`).
- `lib/store.ts`'s public API is unchanged on purpose (`readData(): Promise<AppData>`, `writeData(data): Promise<void>`, `updateData(mutator)`, `getDataFilePath()` — now re-exporting `lib/db/client.ts`'s `getDbFilePath`), so every consumer (`lib/insights.ts`, `lib/report.ts`, `lib/doctor.ts`, `lib/sync.ts`, `app/*.tsx`, every `scripts/*.ts`) needed zero changes. Internally: `readData()` runs one `db.select().from(table).all()` per table and normalizes SQL `NULL` back to `undefined` (Drizzle always decodes `NULL` as `null`, but `AppData`'s optional fields are typed `T | undefined`) — except `AppKeywordMetric.appRank`/`AsoAppRankSnapshot.appRank`, which keep a literal `null` since those fields are explicitly nullable, not just optional. `writeData(data)` wipes every table and bulk-reinserts the full `AppData` object in one `db.transaction(...)` (chunked ~50 rows per insert to stay under SQLite's bound-parameter limit) — this is semantically identical to the old "overwrite the whole JSON file" behavior because every caller (`lib/sync.ts`, `scripts/seed-demo.ts`, etc.) already builds the complete `AppData` in memory and calls `writeData()` exactly once at the end. `AppReview.text` is stored under the DB column/property `reviewText` (the JS name `text` would collide with Drizzle's `text()` column-builder import) and is the one field renamed back and forth in `lib/store.ts`.
- `scripts/migrate-json-to-sqlite.ts` is a one-time helper: reads the legacy `data/openfindability.json` and calls `writeData()` to import it into SQLite. Run once via `pnpm run db:migrate-json`, then the legacy `.json` file can be deleted. `next.config.ts` sets `serverExternalPackages: ["better-sqlite3"]` so Turbopack/webpack doesn't try to bundle the native addon for the server build. `pnpm run db:studio` launches Drizzle Studio, a free local GUI SQL browser against `data/openfindability.db` — the most direct way to make the data "well-queryable" ad hoc, on top of the existing CLI scripts/reports. `pnpm run db:generate` regenerates `drizzle/*.sql` after editing `lib/db/schema.ts`.
- This pass is storage-layer only: `lib/insights.ts`/`lib/report.ts` still aggregate in plain JS over the full `AppData` blob returned by `readData()`, not via SQL `GROUP BY`/`SUM`. That stays a valid future optimization but wasn't needed for `readData()`/`writeData()` to keep their exact same signatures and 100% backward compatibility.
- `lib/db/client.ts` exports `createDb(dbFilePath, migrationsFolder): AppDb` (factory) alongside the module-scope singleton `db`; `lib/store.ts` exports `readDataWith(database)`/`writeDataWith(database, data)` (the same logic `readData`/`writeData` use internally, parameterized by db instance) alongside the `db`-singleton-bound `readData`/`writeData`. This exists for `mcp/server.ts`, which runs via `tsx` from an arbitrary cwd in other repos (see `docs/guide/mcp-server.md`) and therefore can't rely on `process.cwd()`-based path resolution like the main app and CLI scripts do — it resolves its own `data/openfindability.db`/`drizzle/` paths from `import.meta.url` instead, builds its own `AppDb` via `createDb`, and its `readProjects`/`readStoredData`/`writeStoredData` helpers are thin wrappers around `readDataWith`/`writeDataWith` against that instance.
- Known pre-existing limitation (not introduced by the SQLite migration): `mcp/server.ts`'s `@/lib/...` path-aliased imports only resolve correctly via `tsx` when the process's cwd is the OpenFindability repo itself; invoking it with `tsx /path/to/OpenFindability/mcp/server.ts` from a different repo's cwd (the documented "use from any project" flow in `docs/guide/mcp-server.md`) fails to resolve `@/` imports regardless of storage layer. Fixing this (e.g. switching `mcp/server.ts` to relative imports) is a separate, currently unscheduled fix.
- AdMob apps that ship on both stores have two AdMob app ids (Android + iOS); `Project.admobAppIdIos` was added alongside the existing `Project.admobAppId` (which stays Android/primary) so one OpenFindability project can represent one logical app. `syncAdmobProject` (`lib/connectors/admob.ts`) filters the network report to whichever ids are set (`dimensionFilters: [{ dimension: "APP", matchesAny: { values: appIds } }]`) and sums matching rows into a single `metricSnapshots` row per project per day, instead of matching only one hardcoded app id.
- AdMob mediation report data (per ad-source/format breakdown — AdMob Network, AppLovin, Unity Ads, Meta, etc. — with ad requests, match rate, impressions, clicks, estimated earnings, observed eCPM) is synced into a new table/type, `admobMediationMetrics`/`AdmobMediationMetric` (`lib/types.ts`, `lib/db/schema.ts`), not into `metricSnapshots` (different shape/grain — one row per project+date+adSource+format, not one row per project+date). `syncAdmobProject` now returns `{ result, snapshots, mediationMetrics }`; `lib/sync.ts` upserts `admobMediationMetrics` keyed on `(projectId, date, adSourceId, format)` the same way other sources dedupe on re-sync (`upsertMediationMetrics`).
- `pnpm run db:generate` was re-run after these schema changes (`drizzle/0002_damp_karen_page.sql`) — always regenerate + apply (`readData()`/`writeData()` auto-run `migrate()` at module load, so just re-running any script does it) after editing `lib/db/schema.ts`.
- `scripts/add-project.ts` accepts `--admob-app-id-ios` alongside the existing `--admob-app-id`.
- `pnpm run admob:apps` (`scripts/admob-list-apps.ts`) lists every app registered under the AdMob account (`accounts.apps.list`) with its `ca-app-pub-...~...` id, platform and display name — the fastest way to find app ids to configure per project instead of digging through the AdMob UI.
