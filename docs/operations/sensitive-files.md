# Sensitive files

This repository keeps private files out of git.

## Private folders

Use these local-only folders:

```txt
private-notes/
secrets/
sensibili/
```

They are ignored by `.gitignore`.

`private-notes/` is treated as a private scratch folder. Do not put public project documentation there.

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
data/openfindability.json
```

This file is ignored because it can contain private project names, metrics and imported API payloads.

Only `data/.gitkeep` is tracked.
