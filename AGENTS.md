# AGENTS.md

## Project purpose

OpenFindability is a lightweight self-hosted dashboard for deciding what to improve across web projects.

The v0.1 scope is intentionally simple:

- Next.js app in the repository root.
- Local JSON storage in `data/openfindability.json`.
- Google Search Console and Umami connectors.
- Local RespectASO connector for ASO research.
- RevenueCat and AdMob connectors for app monetization stats.
- Manual sync only.
- SEO opportunities from imported metrics.

Do not introduce a monorepo, SaaS billing, auth, queues, cron scheduling or MCP unless explicitly requested.

## Structure

- `app/`: Next.js App Router pages and route handlers.
- `components/ui/`: shadcn/ui primitives (Tailwind v4, `cn` helper in `lib/utils.ts`), ported from the Wiloo project's design system (which itself already used Kiranism's `next-shadcn-dashboard-starter` patterns, including `chart.tsx`).
- `components/charts/`: dashboard chart components (Recharts via `components/ui/chart.tsx`), e.g. `admob-revenue-chart.tsx`, `revenuecat-mrr-chart.tsx`. Client components (`"use client"`); data is computed server-side in `lib/insights.ts` and passed in as props.
- `lib/`: store, connectors, sync logic, insights and shared types.
- `scripts/`: CLI-like commands for local development.
- `docs/`: public project documentation.
- `project/`: private per-project reports, context and notes, ignored by git.
- `private-notes/`: private scratch folder, ignored by git.
- `data/`: local runtime data, ignored except `.gitkeep`.
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
pnpm typecheck
pnpm build
```

## Rules

- Keep v0.1 simple.
- Preserve `rawJson` for imported API payloads.
- Write connector results to `connectorRuns`.
- Keep page-level GSC metrics separate from query-level metrics.
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
