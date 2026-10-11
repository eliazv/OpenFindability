# Sensitive files

This repository keeps private files out of git.

## Private folders

Use these local-only folders:

```txt
private-notes/
project-reports/
secrets/
sensibili/
```

They are ignored by `.gitignore`.

`private-notes/` is treated as a private scratch folder. Do not put public project documentation there.

`project-reports/` stores per-project inspection reports and may contain private metrics. It is now explicitly ignored by git, alongside `project/`, `secrets/` and `data/`.

Public documentation belongs in:

```txt
docs/
README.md
AGENTS.md
CLAUDE.md
```

## Google Search Console

Use a Google service account JSON file.

Recommended location:

```txt
secrets/google/search-console-service-account.json
```

Then configure `.env`:

```env
GOOGLE_SERVICE_ACCOUNT_FILE=./secrets/google/search-console-service-account.json
```

Do not commit the JSON file.

The old `SEARCH_CONSOLE_API_KEY` value is not used by this project. The connector uses `GOOGLE_SERVICE_ACCOUNT_FILE` or `GOOGLE_SERVICE_ACCOUNT_JSON`.

## Android signing keys

The release pipeline (`docs/guide/release-workflow.md`) can sign with a keystore kept here instead
of inside each app's repository:

```txt
secrets/android/<project-slug>/key.properties
secrets/android/<project-slug>/upload-keystore.jks
```

`secrets/` is ignored by git, so these files exist only on this machine. Keep a backup of every
keystore and its passwords somewhere else (a password manager works): an upload key that is lost
can only be replaced by asking Google Play support to reset it, which takes days.

During a build the keystore path and passwords are handed to Gradle as JVM options, so they are
visible to other processes of the same user while the build runs. Do not run releases on a shared
machine.

## Umami

Configure Umami in `.env`:

```env
UMAMI_BASE_URL=https://cloud.umami.is
UMAMI_API_KEY=your-api-key
```

Do not commit `.env`.

If an API key has been shared in a chat, issue, screenshot or commit, rotate it from the provider dashboard.

## Project data

Runtime data is stored locally in:

```txt
data/openfindability.db
```

This file is ignored because it can contain private project names, metrics and imported API payloads.

The runtime SQLite file, WAL/SHM files and backups under `data/backups/` are ignored. Only `data/.gitkeep` is tracked.

## Audit before publishing

Run `pnpm run audit:secrets` for current tracked files and `pnpm run audit:secrets:history` for historical Git blobs (never prints secret values). For an independent scan, use Gitleaks locally: `gitleaks git --redact --log-opts="--all"`.

Review [SECURITY.md](../../SECURITY.md). Even if a credential was removed from the current tree, a previously published key **must be rotated**; history rewrite alone is not remediation.
