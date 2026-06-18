# AGENTS.md

## Project purpose

OpenFindability is a lightweight self-hosted dashboard for deciding what to improve across web projects.

The v0.1 scope is intentionally simple:

- Next.js app in the repository root.
- Local JSON storage in `data/openfindability.json`.
- Google Search Console and Umami connectors.
- Local RespectASO connector for ASO research.
- Manual sync only.
- SEO opportunities from imported metrics.

Do not introduce a monorepo, SaaS billing, auth, queues, cron scheduling or MCP unless explicitly requested.

## Structure

- `app/`: Next.js App Router pages and route handlers.
- `lib/`: store, connectors, sync logic, insights and shared types.
- `scripts/`: CLI-like commands for local development.
- `docs/`: public project documentation.
- `project/`: private per-project reports, context and notes, ignored by git.
- `private-notes/`: private scratch folder, ignored by git.
- `data/`: local runtime data, ignored except `.gitkeep`.
- `secrets/`: local credentials, ignored by git.

## Commands

Use pnpm.

```bash
pnpm install
pnpm seed:demo
pnpm dev
pnpm run doctor
pnpm run sync
pnpm run sync:aso
pnpm run research:aso -- --slug <project-slug>
pnpm typecheck
pnpm build
```

## Rules

- Keep v0.1 simple.
- Preserve `rawJson` for imported API payloads.
- Write connector results to `connectorRuns`.
- Keep page-level GSC metrics separate from query-level metrics.
- Keep ASO keyword snapshots reusable across projects in `asoKeywordSnapshots`.
- Keep app-specific ASO ranks separate in `asoAppRankSnapshots`.
- Do not commit secrets or real project metrics.
- Keep private scratch notes in `private-notes/`, not in `docs/`.
- When asked to inspect or reason about a project, create/update `project/<project-slug>/reports/` and write a dated report there.
- Service account JSON files belong in `secrets/google/`.
- Update `.env.example` when adding env vars.
- Prefer small server-side functions in `lib/`.
- Update `AGENTS.md` and `CLAUDE.md` whenever changing project workflow, commands, storage shape or conventions.
