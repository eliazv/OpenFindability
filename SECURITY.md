# Security policy

OpenFindability is an open-source, **local-first analytics and store-metadata tool**. It can access Google Search Console, Play Console, App Store Connect, AdMob, AdSense, RevenueCat, and other provider APIs. Treat all tokens, local database content and reports as confidential.

## Reporting a vulnerability

Please do **not** open a public GitHub issue containing a real token, credential, customer report, or private API response. Use GitHub's **Report a vulnerability** / private vulnerability reporting if enabled for this repository. If that option is unavailable, contact the maintainer privately through an established channel without posting the secret itself. If a live secret is exposed, rotate/revoke it at the provider immediately.

## Local safeguards

- Keep tokens and service accounts only in ignored `.env` and `secrets/`.
- Never commit `.p8`, `.pem`, `.p12`, `.jks`, `*.db`, OAuth refresh tokens, Google/Firebase configuration or raw analytics exports containing personal/customer data.
- Store runtime SQLite under `data/`; private reports under `project/`, `project-reports/` or `private-notes/`.
- `pnpm run audit:secrets` scans the current tracked worktree; `pnpm run audit:secrets:history` checks reachable historical Git blobs. This is a **basic signature scanner** and can produce false positives/negatives.
- For an independent history scan, install [Gitleaks](https://github.com/gitleaks/gitleaks) and run `gitleaks git --redact --log-opts="--all"`. Never commit the resulting raw report.
- Review GitHub **Settings → Security & analysis** and **Security → Secret scanning** alerts / push protection. Support depends on account/repo eligibility.
- Do not deploy the local dashboard directly to the public Internet: write endpoints and MCP project tools are intended for trusted local operation. A full authentication/authorization boundary is required for remote exposure.

## If a leak is found

1. **Revoke/rotate first** in Google, Apple, RevenueCat, GitHub, AdMob, etc. Assume the exposed key is compromised.
2. Stop relying on `.gitignore` as a retroactive fix: ignored files may still exist in past commits and forks.
3. Identify impacted repositories, scopes and time ranges, check provider access logs.
4. If necessary, plan history rewriting using `git filter-repo` after coordination; force-pushing does not revoke keys or erase forks/clones.
5. Validate by rescanning the history and testing new, least-privileged credentials.

## Repository visibility

Public source code is compatible with private analytics **only when credentials and runtime data remain outside Git**. If project notes, client lists or financial metrics are commercially sensitive, keep them in ignored private workspaces. The README, `docs/`, `AGENTS.md` and `CLAUDE.md` are public.
