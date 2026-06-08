# CLAUDE.md

OpenFindability v0.1 is a simple local Next.js app, not a monorepo.

Current goal:

```txt
Google Search Console + Umami + projects + manual sync + SEO opportunities.
```

Avoid adding advanced architecture before the base product is useful.

Useful commands:

```bash
pnpm seed:demo
pnpm dev
pnpm run doctor
pnpm run sync
pnpm run sync:aso
pnpm typecheck
pnpm build
```

Important implementation notes:

- Data lives in `data/openfindability.json`.
- Runtime data is ignored by git.
- Public docs live in `docs/`.
- Private project files live in `project/<project-slug>/` with subfolders: `reports/`, `context/`, `notes/`.
- Private scratch notes live in `private-notes/` and are ignored by git.
- Service account JSON files live in `secrets/google/`.
- GSC backfill defaults to 30 days.
- Umami sync imports yesterday.
- Keep `rawJson` on imported records.
- Store connector run logs.
- Do not add SaaS-specific code yet.
- ASO data comes from a local RespectASO instance (not SaaS); see `docs/guide/aso-workflow.md`. Configure `asoKeywords`/`asoCountries`/`appStoreTrackId` per project.
