# Changelog

## Unreleased

### Added

- Added `pnpm run research:aso` for one-off ASO + SEO research reports.
- Added `respectAsoAppId` project configuration for RespectASO internal app ids.
- Added ASO options to `pnpm run project:add`:
  - `--app-store-track-id`
  - `--respect-aso-app-id`
  - `--aso-keywords`
  - `--aso-countries`
- Added RespectASO history fallback for research reports when a keyword has already been searched and RespectASO skips returning live rows.
- Added persistent ASO keyword and app-rank snapshot cache in local JSON storage.
- Added cache controls to `pnpm run research:aso`: `--cache-max-age-days` and `--refresh`.
- Added ASO cache counts to `pnpm run doctor`.
- Added `RESPECT_ASO_BASE_URL` to `.env.example`.

### Changed

- RespectASO reports now write to `project/<slug>/reports/`, matching the repo's ignored per-project workspace.
- ASO research now reuses fresh local keyword snapshots before calling RespectASO.
- RespectASO keyword sync now sends requests in batches of 20 keywords.
- RespectASO form submission now uses the CSRF token and multipart form shape expected by the local UI.
- ASO workflow docs now include a guided research command for apps whose landing page data lives under a different GSC project.

### Fixed

- Fixed RespectASO app rank lookup by supporting the local RespectASO app id separately from the public App Store track id.
