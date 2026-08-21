# Operating playbook — running an ASO/monetization session end-to-end

The other guides in `docs/guide/` document each connector in isolation. This one is the missing
piece: the actual order of operations for a real session (e.g. "analyze and improve ASO + store
listing for app X"), written from a full session doing exactly that.

## Typical flow

1. **Make sure the project exists and has the right fields set.**
   `pnpm run project:update -- --slug <slug> --play-console com.example.app --app-store-track-id 123 ...`
   (see "Editing an existing project" below — `project:add` only creates, it errors if the slug
   already exists).

2. **Sync the connector(s) you need.** `pnpm run sync:aso`, `pnpm run sync:admob`, etc. Most syncs
   run against *all* configured projects — fine to just re-run, projects without the relevant field
   set are silently `SKIPPED`, not an error.

3. **ASO keyword research**: set `asoKeywords`/`asoCountries` on the project (via `project:update`),
   run `pnpm run sync:aso`, then read `app_keywords` for that project/country ordered by
   `opportunity_score`. Repeat with a new keyword batch as many times as you want — each sync just
   upserts (same keyword+country+date gets replaced, doesn't duplicate).
   - RespectASO country codes are Apple App Store country codes (`it`, `es`, `br`, ...) — it has
     **no Google Play data**, it's an App Store keyword tool. Useful as directional signal for
     Play Store too (real search behavior correlates loosely across stores) but say so explicitly
     when reporting results — don't present it as Play Store data.
   - Popularity/difficulty/opportunity scores don't need `respectAsoAppId` — that field is only for
     getting *this app's own rank* per keyword, which most sessions don't need.
   - Keywords with a high opportunity score aren't automatically worth using: check they match
     something the app *actually has*. A high-volume keyword for a feature/mode the app doesn't
     support will drive installs that uninstall fast (hurts store ranking) — cross-check candidate
     keywords against the real app/game feature list before using them, don't just take the top of
     the opportunity-score list.

4. **Draft store copy** (title/subtitle/keywords/description) informed by the research + a reading
   of the *live* public listing (Play: fetch the public store page; App Store: same, or
   `pnpm run aso:pull-copy`). Check character limits per field before drafting, not after (Play:
   title 30, short description 80, full description 4000; App Store: name 30, subtitle 30,
   keywords field 100, promotional text 170 — App Store's keywords field should not repeat words
   already in name/subtitle, Apple indexes those separately).

5. **Publishing is different per store — know which before promising a timeline:**
   - **Play Store**: `edits.insert` → `edits.listings.update` (per language) → `edits.commit` via
     the `androidpublisher` API goes **live within hours, no review**. The same OAuth scope
     (`androidpublisher`) covers both read (reviews/stats) and write (listing) — if reading reviews
     already works, writing the listing will too, no extra permission needed.
   - **App Store Connect**: description/keywords/promotional text/what's new can only be written to
     an app version in an *editable* state (`PREPARE_FOR_SUBMISSION`/rejected states) — **not** the
     live `READY_FOR_SALE` version. If no such version exists, someone has to create one in App
     Store Connect first (a new version doesn't require a build to be attached yet — text can be
     filled in before that). Even once written, changes only reach the public App Store after Apple
     reviews the submitted version — there's no Play-Store-style instant publish for these fields.
   - Adding a **new locale** (App Store) vs *updating* an existing one are different API operations
     (POST vs PATCH) — see `reusing-connectors.md`-adjacent code in
     `lib/connectors/appstoreconnect.ts`; the CLI (`aso:push-copy`) only updates existing
     localizations, it doesn't create new ones. Creating a new App Store locale currently needs a
     one-off script (see git history around 2026-08-13 for a worked example) — a `--create` flag on
     `asc-metadata.ts push` would be a reasonable follow-up if this comes up often.
   - App name strings are checked for **global uniqueness across all Apple developer accounts** —
     a perfectly reasonable localized title can 409 with `DIFFERENT_ACCOUNT` because someone else
     already registered that exact string. Have a fallback variant ready.

## Editing an existing project

`pnpm run project:update -- --slug <slug> [--field value ...]` (added 2026-08-13). Same flags as
`project:add`, but finds the project by slug and only overwrites the fields you actually pass —
everything else on the project is left untouched. Use this instead of hand-writing SQL against
`data/openfindability.db` (works, but risks affecting more than intended, and doesn't go through
`updateData()`'s single-writer transaction).

## Known gotcha, already fixed

`lib/connectors/appstoreconnect.ts`'s `getAppInfoLocalizations` used to grab "the first" `appInfo`
resource for an app, assuming Apple always returns the live one first. When a new version is in
progress, Apple actually exposes **two** `appInfo` resources (one `READY_FOR_SALE`, read-only; one
`PREPARE_FOR_SUBMISSION`, editable) and which one comes first in the list isn't reliable — writes
through the old code intermittently 409'd with "can not be modified in the current state". Fixed
2026-08-13 to prefer the editable one (same `EDITABLE_VERSION_STATES` set already used for
`getEditableAppStoreVersion`). If a similar "picks the wrong one of two API resources" bug shows up
elsewhere in this connector, this is the pattern to look for.

## Things that looked like bugs but weren't

A project's `playConsolePackageName` (and other manually-set fields) appeared to reset to `null`
mid-session once. Deliberately re-tested the full `readData()`/`writeData()` round-trip (including
through `pnpm run sync:aso`) afterwards and could not reproduce it — the round-trip preserves all
columns correctly (drizzle selects/inserts every schema column generically, nothing is hand-mapped
and dropped). Likely just not re-set after an earlier step in that session, not a real bug. If it
happens again with a clean reproduction, that's worth another look — but don't assume `writeData()`
drops fields based on this one report.
