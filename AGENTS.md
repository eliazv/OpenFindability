# AGENTS.md

## Project purpose

OpenFindability is a lightweight self-hosted dashboard for deciding what to improve across web projects.

The v0.1 scope is intentionally simple:

- Next.js app in the repository root.
- Local JSON storage in `data/openfindability.json`.
- Google Search Console and Umami connectors.
- Manual sync only.
- SEO opportunities from imported metrics.

Do not introduce a monorepo, SaaS billing, auth, queues, cron scheduling or MCP unless explicitly requested.

## Structure

- `app/`: Next.js App Router pages and route handlers.
- `lib/`: store, connectors, sync logic, insights and shared types.
- `scripts/`: CLI-like commands for local development.
- `docs/`: planning and architecture notes.
- `data/`: local runtime data, ignored except `.gitkeep`.

## Commands

Use pnpm.

```bash
pnpm install
pnpm seed:demo
pnpm dev
pnpm run doctor
pnpm run sync
pnpm typecheck
pnpm build
```

## Rules

- Keep v0.1 simple.
- Preserve `rawJson` for imported API payloads.
- Write connector results to `connectorRuns`.
- Keep page-level GSC metrics separate from query-level metrics.
- Do not commit secrets or real project metrics.
- Update `.env.example` when adding env vars.
- Prefer small server-side functions in `lib/`.
