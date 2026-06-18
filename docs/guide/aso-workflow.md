# ASO workflow (RespectASO connector)

OpenFindability can pull App Store keyword data from a local [RespectASO](https://github.com/respectlytics/respectaso) instance and turn it into ASO opportunities and reports.

## Requirements

Run RespectASO locally (e.g. via `docker compose up -d` in its own directory). It must be reachable at `http://localhost` (port 80 by default).

Optional override in `.env`:

```env
RESPECT_ASO_BASE_URL=http://localhost
```

`pnpm run doctor` checks reachability when at least one project has `asoKeywords` configured.

## Configure a project

Add these fields to a project in `data/openfindability.json`:

```json
{
  "asoKeywords": ["marafone", "trionfo", "beccaccino", "tressette"],
  "asoCountries": ["it"],
  "appStoreTrackId": 6749573579,
  "respectAsoAppId": 2
}
```

- `asoKeywords`: up to 20 keywords sent per search request.
- `asoCountries`: up to 5 country codes (defaults to `["it"]`).
- `appStoreTrackId`: optional App Store/iTunes track id. Keep it for public store references.
- `respectAsoAppId`: optional RespectASO internal app id. Prefer this when you want keyword ranks in RespectASO reports. You can read it from the app dropdown in the local RespectASO UI.

You can add the fields when creating a project:

```bash
pnpm run project:add -- --name "Sette e Mezzo" --slug settemezzo --type app \
  --app-store-track-id 6753985213 \
  --respect-aso-app-id 3 \
  --aso-countries it \
  --aso-keywords "sette e mezzo,7 e mezzo,carte italiane"
```

## Sync

```bash
pnpm run sync:aso
```

This connects to the local RespectASO instance, searches the configured keywords/countries, and stores the results as `appKeywords` records (`lib/connectors/aso.ts`). Each record keeps `popularityScore`, `difficultyScore`, `opportunityScore`, `difficultyLabel`, `classification`, `appRank` and the raw payload (`rawJson`). The connector sends keywords in batches of 20, matching the RespectASO search limit.

If RespectASO is not reachable, the connector returns a `skipped` result with a message explaining how to start it — it does not fail the whole sync run.

## Report

```bash
pnpm run report
```

Generates an ASO section (`buildAsoReportMarkdown` in `lib/report.ts`) per project that has `asoKeywords` configured: latest snapshot ranked by opportunity score, plus a breakdown by classification.

## ASO + SEO research reports

For one-off store listing research, use:

```bash
pnpm run research:aso -- \
  --slug settemezzo \
  --gsc-slug elia-zavatta \
  --respect-aso-app-id 3 \
  --url-contains settemezzo.eliazavatta.it \
  --query-contains "sette" \
  --query-contains "mezzo" \
  --keywords "sette e mezzo,7 e mezzo,sette e mezzo gratis,sette e mezzo online,carte italiane"
```

If the app is not yet a configured OpenFindability project, use an existing GSC project as the source and choose a separate report folder/title:

```bash
pnpm run research:aso -- \
  --slug elia-zavatta \
  --gsc-slug elia-zavatta \
  --output-slug settemezzo \
  --title "Sette e Mezzo" \
  --respect-aso-app-id 3 \
  --url-contains settemezzo.eliazavatta.it \
  --query-contains "sette" \
  --query-contains "mezzo" \
  --keywords "sette e mezzo,7 e mezzo,sette e mezzo gratis,sette e mezzo online,carte italiane"
```

The command writes a dated markdown report to `project/<output-slug>/reports/` when `--output-slug` is provided, otherwise to `project/<slug>/reports/`. It does not change stored metrics. It combines:

- live RespectASO keyword metrics for candidate keywords;
- stored GSC query/page rows filtered by URL and query terms;
- a compact report that is ready for App Store / Play Store copy decisions.

It also stores ASO keyword snapshots in `data/openfindability.json` so later projects can reuse recent results without calling RespectASO again.

Cache behavior:

- Fresh cache defaults to 14 days.
- `--cache-max-age-days 30` changes the freshness window.
- `--refresh` bypasses fresh cache and asks RespectASO again.
- If RespectASO skips a keyword because it is already in its history, OpenFindability imports the latest row from RespectASO's CSV export.

Stored ASO history is split by purpose:

- `asoKeywordSnapshots`: reusable keyword metrics (`keyword + country + date`), useful across projects.
- `asoAppRankSnapshots`: app-specific rank observations (`app/project + keyword + country + date`).

Classification reference:

```txt
sweet_spot       high popularity + low difficulty -> ideal target
good_target      good balance of opportunity
hidden_gem       lower popularity but very easy to rank -> niche win
high_competition high popularity but very hard -> avoid unless strong brand
moderate         average on both dimensions
low_volume       few searches -> only relevant for very niche apps
avoid            not worth targeting
```

## Notes

- This is a local-only connector: it talks to your own RespectASO container, not a SaaS.
- Keep store listing strings (title, subtitle, keywords field, description) in `project/<slug>/notes/`. Use the ASO report's opportunity/classification data to decide which keywords deserve a slot in those strings.

## Architecture note

Keep RespectASO as an external local dependency for now.

Reasons:

- OpenFindability v0.1 should stay a lightweight Next.js app with JSON storage.
- RespectASO already owns App Store keyword scoring, competitor collection, history and CSV export.
- Calling the local RespectASO UI/API keeps OpenFindability focused on cross-source decisions: ASO + GSC + reports.
- RespectASO is AGPL-3.0 licensed, so copying its implementation into this project would need a deliberate license decision.

A native OpenFindability ASO connector can make sense later if the project needs only a small stable subset, such as iTunes Search API calls, keyword scoring and rank tracking, without the full RespectASO UI/history stack.
