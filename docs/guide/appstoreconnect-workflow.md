# App Store Connect workflow (ASO copy + Product Page Optimization)

OpenFindability can read and write your live App Store product page text (name, subtitle,
keywords, description, promotional text, what's new) and manage Product Page Optimization (PPO)
tests, using an App Store Connect API key.

## Important: what Apple actually A/B-tests

Product Page Optimization only tests **app icon, screenshots, and app preview videos**. Apple has
**no A/B testing for text** (name, subtitle, description, keywords) — text changes are single-variant
metadata edits reviewed by Apple, not split tests. This connector reflects that:

- Store **text** is a read/write metadata workflow: pull the current copy, draft new copy (use
  `pnpm run research:aso` / the ASO report's opportunity scores to decide which keywords deserve a
  slot), push it, and compare later ASO rank movement against the push date — a sequential
  before/after, not a live split test.
- Store **visuals** (icon/screenshots/previews) go through real PPO experiments — this connector can
  create the experiment/treatment shells and list their state, but Apple only shows the actual
  winner/conversion metrics in the App Store Connect UI (App Analytics), not via this API.

## Setup

Create a key in App Store Connect → Users and Access → Integrations → App Store Connect API (Team
Key, "App Manager" role or higher). Put the downloaded `.p8` file under
`./secrets/appstoreconnect/` and set in `.env`:

```env
ASC_ISSUER_ID=...
ASC_KEY_ID=...
ASC_PRIVATE_KEY_PATH=./secrets/appstoreconnect/AuthKey_<KEY_ID>.p8
```

`pnpm run doctor` checks these are set and the key file exists.

## Configure a project

Reuse the existing `appStoreTrackId` field (Apple's App Store Connect `id` for an app is the same
numeric id as the public App Store "Apple ID"/trackId already used for ASO). Run:

```bash
pnpm run asc:apps
```

to list every app visible to the key (id, bundle id, name) and confirm the mapping.

## Read/write store text

```bash
pnpm run aso:pull-copy -- --slug <slug> [--locale it]
```

Pulls current name/subtitle (App Info) and keywords/description/promotional text/what's new (from
the current editable App Store version, if one exists) for every locale, or one locale with
`--locale`. Writes `project/<slug>/reports/<date>-appstoreconnect-copy.md` and stores an
`ascMetadataSnapshots` row (`kind: "pull"`) per locale.

```bash
pnpm run aso:push-copy -- --slug <slug> --locale it \
  [--name "..."] [--subtitle "..."] [--keywords "..."] \
  [--description-file path.txt] [--promotional-text "..."] [--whats-new "..."] \
  [--apply]
```

Dry-run by default — prints an old → new diff for every field you pass and writes nothing. Add
`--apply` to actually PATCH App Store Connect and store an `ascMetadataSnapshots` row
(`kind: "push"`). Description/keywords/promotional text/what's new require an editable App Store
version (state `PREPARE_FOR_SUBMISSION`/rejected) to exist — create one in App Store Connect first
if there isn't one. Name/subtitle write independently of that (App Info, not version-scoped).
Changes land on the live App Store only after Apple reviews the draft version.

## Product Page Optimization (icon/screenshots/app previews)

```bash
pnpm run asc:experiments -- --slug <slug>
```

Syncs every experiment + its treatments for the project into `ascExperiments` /
`ascExperimentTreatments` and prints their state.

```bash
pnpm run asc:experiments -- --slug <slug> --create-experiment "Screenshots test" --element screenshot
pnpm run asc:experiments -- --slug <slug> --add-treatment <ascExperimentId> --name "Variant B"
```

Creates an experiment / treatment shell via the API. Attaching the actual icon/screenshot/app
preview assets to a treatment is still a manual App Store Connect UI step — this connector does not
upload creative assets.

## Report

```bash
pnpm run report -- <slug> asc
```

Generates a section (`buildAscReportMarkdown` in `lib/report.ts`) with the latest pulled/pushed
copy per locale and the experiments/treatments table, from whatever has already been synced above
(not a live pull).

## Notes

- Not part of default `pnpm run sync` — like ASO, this is an on-demand editorial workflow, not a
  daily metric pull.
- `ascMetadataSnapshots` is append-only: every pull/push is kept, giving a full audit trail of copy
  changes over time.
