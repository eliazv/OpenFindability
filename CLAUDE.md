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
pnpm typecheck
pnpm build
```

Important implementation notes:

- Data lives in `data/openfindability.json`.
- Runtime data is ignored by git.
- GSC backfill defaults to 30 days.
- Umami sync imports yesterday.
- Keep `rawJson` on imported records.
- Store connector run logs.
- Do not add SaaS-specific code yet.
