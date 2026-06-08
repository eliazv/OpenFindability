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
  "appStoreTrackId": 6749573579
}
```

- `asoKeywords`: up to 20 keywords sent per search request.
- `asoCountries`: up to 5 country codes (defaults to `["it"]`).
- `appStoreTrackId`: optional iTunes track id, used to also report the app's current rank for each keyword.

## Sync

```bash
pnpm run sync:aso
```

This connects to the local RespectASO instance, searches the configured keywords/countries, and stores the results as `appKeywords` records (`lib/connectors/aso.ts`). Each record keeps `popularityScore`, `difficultyScore`, `opportunityScore`, `difficultyLabel`, `classification`, `appRank` and the raw payload (`rawJson`).

If RespectASO is not reachable, the connector returns a `skipped` result with a message explaining how to start it — it does not fail the whole sync run.

## Report

```bash
pnpm run report
```

Generates an ASO section (`buildAsoReportMarkdown` in `lib/report.ts`) per project that has `asoKeywords` configured: latest snapshot ranked by opportunity score, plus a breakdown by classification.

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
