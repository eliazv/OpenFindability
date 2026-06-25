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
pnpm run research:aso -- --slug <project-slug>
pnpm typecheck
pnpm build
```

Important implementation notes:

- Data lives in `data/openfindability.json`.
- Runtime data is ignored by git.
- Public docs live in `docs/`.
- Private project files live in `project/<project-slug>/` with subfolders: `reports/`, `context/`, `notes/`.
- Dated project analysis reports belong in `project/<project-slug>/reports/`.
- Private scratch notes live in `private-notes/` and are ignored by git.
- Service account JSON files live in `secrets/google/`.
- GSC backfill defaults to 30 days.
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
- UI uses Tailwind v4 + a small set of shadcn/ui primitives (`components/ui/`: button, card, badge, table, separator), styled to match the same design tokens used in the Wiloo project (`components.json`, `lib/utils.ts` cn helper). Add new shadcn primitives the same way (copy + adapt import paths) instead of hand-rolling CSS classes.
