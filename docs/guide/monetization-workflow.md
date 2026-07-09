# Monetization workflow (RevenueCat + AdMob connectors)

OpenFindability can pull subscription metrics from RevenueCat and ad revenue from AdMob, alongside the existing GSC/Umami/Play Console/ASO data.

## RevenueCat

### Requirements

Create a **V2 secret key** in the RevenueCat dashboard with the `charts_metrics:overview:read` permission enabled, then set it in `.env`:

```env
REVENUECAT_API_KEY=sk_xxx
```

This is a plain Bearer token — there is no separate OAuth flow for RevenueCat.

### Configure a project

```json
{
  "revenueCatProjectId": "proj_xxx"
}
```

```bash
pnpm run project:add -- --name "Sette e Mezzo" --slug settemezzo --type app \
  --revenuecat-project-id proj_xxx
```

### Sync

```bash
pnpm run sync:revenuecat
```

Calls the RevenueCat v2 Overview Metrics endpoint (`GET /v2/projects/{project_id}/metrics/overview`) and stores one `metricSnapshots` row per project per day with `mrr`, `activeSubscribers` (`active_subscriptions`), `activeTrials`, `newCustomers` and `revenue` (`revenue_last_28_days`).

**Important:** `revenue` here is a rolling 28-day window, not a true daily figure. Do not sum it across multiple days — only the latest snapshot per project reflects current state. `lib/insights.ts`'s `summarizeMonetization`/`summarizeProject` already follow this rule.

## AdMob

### Requirements

AdMob has no service-account support — it needs interactive OAuth2 as the AdMob account owner.

1. In Google Cloud Console, create an OAuth2 client of type "Desktop app" and enable the AdMob API.
2. Set the client credentials in `.env`:

   ```env
   ADMOB_CLIENT_ID=
   ADMOB_CLIENT_SECRET=
   ADMOB_PUBLISHER_ID=pub-xxxxxxxxxxxxxxxx
   ```

3. Run the one-time auth helper **on your own machine** (it needs a real browser; it will not work in a remote/headless session):

   ```bash
   pnpm run admob:auth
   ```

   Open the printed URL, sign in with the Google account that owns the AdMob account, and copy the printed `ADMOB_REFRESH_TOKEN` into `.env`.

### Configure a project

If the app ships on both Android and iOS with two different AdMob app ids, set both — `admobAppId` is Android/primary, `admobAppIdIos` is the iOS counterpart. Revenue from both is summed into one snapshot per project per day.

```json
{
  "admobAppId": "ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy",
  "admobAppIdIos": "ca-app-pub-xxxxxxxxxxxxxxxx~zzzzzzzzzz"
}
```

```bash
pnpm run project:add -- --name "Sette e Mezzo" --slug settemezzo --type app \
  --admob-app-id ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy \
  --admob-app-id-ios ca-app-pub-xxxxxxxxxxxxxxxx~zzzzzzzzzz
```

Don't know the App IDs? List every app registered under the AdMob account:

```bash
pnpm run admob:apps
```

### Sync

```bash
pnpm run sync:admob
```

Calls `accounts.networkReport.generate` for yesterday's date, filters rows matching the project's `admobAppId`/`admobAppIdIos`, and sums them into one `metricSnapshots` row with `revenue` (converted from `ESTIMATED_EARNINGS` micros), `impressions`, `clicks` and `adRequests`.

AdMob's daily network report is a true daily total, safe to sum across dates and projects (unlike RevenueCat's rolling window above).

### Mediation report

The same sync also calls `accounts.mediationReport.generate` (dimensions `DATE, APP, AD_SOURCE, FORMAT`) to see which mediated ad network (AdMob Network, AppLovin, Unity Ads, Meta, etc.) and ad format is actually driving revenue — the network report above only gives an account-level total. Results are stored in a separate table, `admobMediationMetrics` (one row per project/date/ad source/format), with `adRequests`, `matchedRequests`, `matchRate` (computed), `impressions`, `clicks`, `estimatedEarnings` and `observedEcpm`. Not yet surfaced in the dashboard/report — query it directly (`pnpm run db:studio` or `readData().admobMediationMetrics`) for now.

## Dashboard

The home page shows a "Monetizzazione" section with two cards:

- **AdMob**: revenue yesterday and this month (true sums), a trend badge comparing this month to the previous calendar month, and an area chart (`components/charts/admob-revenue-chart.tsx`) of daily revenue summed across projects over the last 30 days (`getAdmobRevenueTrend` in `lib/insights.ts`).
- **RevenueCat**: MRR, active subscribers and revenue over the last 28 days (latest snapshot only, summed across projects), a trend badge comparing MRR at the start vs. end of the last 30 days, and an area chart (`components/charts/revenuecat-mrr-chart.tsx`) of MRR summed across projects over the last 30 days (`getRevenueCatMrrTrend` in `lib/insights.ts`).

Both cards show a setup hint instead of numbers until at least one snapshot exists for that source. The charts use the shared `components/ui/chart.tsx` primitive (Recharts, ported from shadcn/Kiranism) and only render once there are at least two distinct dates of data.

The "Progetti" table also includes per-project "Ricavi Ads" and "MRR" columns, reusing the same `summarizeProject` fields as the cards.

All of this is still computed server-side from `data/openfindability.json` by plain functions in `lib/insights.ts` — the charts/tables are a presentation layer only. Nothing here changes how the data is synced, stored or scripted: `pnpm run sync*`, `pnpm run doctor` and the JSON store remain the source of truth and stay fully usable from the CLI/AI side without the web UI.

## Report

```bash
pnpm run report -- <project-slug> monetization
```

Writes `project/<slug>/reports/<date>-monetization-data.md` (`buildMonetizationReportMarkdown` in `lib/report.ts`): AdMob revenue for the last sync day, this month and the previous month (true daily sums) plus a daily table for the last 30 synced days; RevenueCat's latest MRR, active subscribers, active trials and new customers, plus its rolling 28-day revenue and an MRR trend table for the last 30 synced days. Skipped (with a log message) if the project has neither `admobAppId` nor `revenueCatProjectId` configured. Also included when running `pnpm run report -- <slug> all`.

## Notes

- Both connectors are part of the default `pnpm run sync` (like GSC/Umami/Play Console), since each is a single cheap API call per project — unlike ASO, which stays strictly opt-in (`pnpm run sync:aso`) due to rate limits.
- `pnpm run doctor` checks that `REVENUECAT_API_KEY` and the full AdMob credential set are configured, and flags stale syncs per project/source.
- RevenueCat's Charts time-series API (which would give true daily revenue instead of a rolling window) is not implemented yet — flagged as a known v0.1 limitation rather than guessed at.
- `lib/sync.ts` upserts `metricSnapshots` by `(projectId, source, date)` on every sync, so re-running `pnpm run sync:revenuecat`/`pnpm run sync:admob` (or the default `pnpm run sync`) the same day replaces that day's row instead of duplicating it — safe for the monthly/trend sums above. `admobMediationMetrics` is upserted the same way, keyed by `(projectId, date, adSourceId, format)`.
