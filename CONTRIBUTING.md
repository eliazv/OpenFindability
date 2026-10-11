# Contributing to OpenFindability

OpenFindability is a local-first analytics and app-store intelligence project for developers who manage several sites and apps. The repository contains **generic source code**; all credentials, imported statistics, client data and signing artifacts stay local.

## Development

Requirements: Node.js, pnpm, and provider accounts only when testing actual connectors.

```bash
pnpm install
pnpm run seed:demo
pnpm dev
pnpm typecheck
pnpm run test:gsc
pnpm run test:reliability
```

**Warning:** demo seeding refuses to overwrite a populated SQLite database unless explicitly forced. Use a separate checkout/data directory for development. Before any sync or migration involving real data, run `pnpm run db:backup`.

## Adding a connector

1. Add a descriptor to `lib/connectors/catalog.ts` with native grain (daily, snapshot, events), reporting delay, permissions and setup docs.
2. Keep provider API code separate from aggregation/UI. Data models must carry project id, date, currency/unit and freshness/coverage where meaningful.
3. Paginate large results, honor rate limits and mark no-data/partial results accurately; never turn missing metrics into zero.
4. Make sync idempotent, add deterministic tests/fixtures, and do not log access tokens or raw customer payloads.
5. Expose read-only results consistently through CLI, dashboard, MCP and (when implemented) the summary-only Google Sheet exporter.
6. Any operation that *changes* an app-store listing, release or customer system must have explicit dry-run/confirmation and an audit trail.

## Security

Read [SECURITY.md](SECURITY.md). Before publishing a branch, run:

```bash
pnpm run audit:secrets
pnpm run audit:secrets:history
```

An independent Gitleaks run against full Git history is recommended. Do not add real API keys to examples, tests, `.env.example`, issues or screenshots. If you identify a vulnerability, use a private channel instead of sharing secrets in public issues.

## Scope and reviews

Prefer small changes fixing data correctness and actionable insights over framework migrations, new SaaS infrastructure or unneeded providers. No GitHub Actions execution is necessary to develop or test locally. Changes to release automation need especially conservative review.
