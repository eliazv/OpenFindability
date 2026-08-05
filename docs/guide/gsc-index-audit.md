# Google Search Console index audit

OpenFindability can run a manual, progressive index audit across every property visible to the configured Google service account:

```bash
pnpm run audit:index
```

The default scan budget is 2,000 URL Inspection calls per property, matching Google's per-property daily quota. A smaller first pass is useful while validating credentials and sitemap discovery:

```bash
pnpm run audit:index -- 100
```

The optional second argument filters by OpenFindability project slug or by a substring of the GSC property:

```bash
pnpm run audit:index -- 2000 example-site
pnpm run audit:index -- 2000 sc-domain:example.com
```

## URL discovery

For each connected GSC property, the audit combines:

- submitted sitemap and sitemap-index XML;
- pages returned by Search Analytics over the last 90 days;
- stored GSC page/query rows for mapped projects;
- URLs retained from previous audits;
- the property root URL.

Properties do not need to be mapped to an OpenFindability project. Unmapped properties are still audited, appear in the global report and receive a dated report under `project/<domain-name>/reports/`; mapped ones use their configured `project/<slug>/reports/` directory.

## Stored results

Each inspection is stored in `gscIndexInspections` with:

- property, URL, discovery sources and inspection timestamp;
- verdict and coverage state;
- robots, indexing and page-fetch states;
- Google/user canonical and last crawl;
- normalized issue code and severity;
- the full response in `rawJson`.

Same-day duplicates are replaced. Re-running the command skips URLs already inspected that day and prioritizes URLs never inspected, then previous high/medium problems, then older successful inspections. This ensures large properties eventually reach full discovered-URL coverage instead of spending each day's quota rechecking the same problems.
Large scans use 16 concurrent API calls and checkpoint results every 500 completed inspections so a later network failure does not discard the whole property's progress.

The dashboard shows the latest known state per URL. Reports group affected URLs by issue and include a recommended action:

```bash
pnpm run report -- example-site index
```

## Limitation

Google Search Console has no public bulk endpoint for the Page Indexing report and does not expose its complete private URL inventory. This audit therefore covers every URL OpenFindability can discover from public sitemaps, Search Analytics and its own history, but it cannot reproduce the Search Console UI report exactly. URL Inspection also returns Google's indexed version, not a live-test crawl.
