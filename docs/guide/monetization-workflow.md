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

```json
{
  "admobAppId": "ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy"
}
```

```bash
pnpm run project:add -- --name "Sette e Mezzo" --slug settemezzo --type app \
  --admob-app-id ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy
```

### Sync

```bash
pnpm run sync:admob
```

Calls `accounts.networkReport.generate` for yesterday's date, filters the report row matching the project's `admobAppId`, and stores one `metricSnapshots` row with `revenue` (converted from `ESTIMATED_EARNINGS` micros), `impressions`, `clicks` and `adRequests`.

AdMob's daily network report is a true daily total, safe to sum across dates and projects (unlike RevenueCat's rolling window above).

## Dashboard

The home page shows a "Monetizzazione" section with two cards:

- **AdMob**: revenue yesterday and this month (true sums).
- **RevenueCat**: MRR, active subscribers and revenue over the last 28 days (latest snapshot only, summed across projects).

Both cards show a setup hint instead of numbers until at least one snapshot exists for that source.

## Notes

- Both connectors are part of the default `pnpm run sync` (like GSC/Umami/Play Console), since each is a single cheap API call per project — unlike ASO, which stays strictly opt-in (`pnpm run sync:aso`) due to rate limits.
- `pnpm run doctor` checks that `REVENUECAT_API_KEY` and the full AdMob credential set are configured, and flags stale syncs per project/source.
- RevenueCat's Charts time-series API (which would give true daily revenue instead of a rolling window) is not implemented yet — flagged as a known v0.1 limitation rather than guessed at.
