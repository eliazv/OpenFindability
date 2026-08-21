import type {
  AppData,
  AppKeywordMetric,
  GscDimensionBreakdown,
  GscIndexInspection,
  GscIndexIssueCode,
  MetricSnapshot,
  PageMetric,
  Project,
  SearchQueryMetric,
} from "@/lib/types";
import { getIndexIssueRecommendation } from "@/lib/gsc-index-audit";
import { getAdmobRevenueRows } from "@/lib/insights";

export type AggregatedRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
};

function aggregate<T extends { clicks: number; impressions: number; avgPosition: number }>(
  rows: T[],
  keyOf: (row: T) => string,
): AggregatedRow[] {
  const byKey = new Map<string, { clicks: number; impressions: number; positionWeighted: number }>();

  for (const row of rows) {
    const key = keyOf(row);
    const existing = byKey.get(key) ?? { clicks: 0, impressions: 0, positionWeighted: 0 };
    existing.clicks += row.clicks;
    existing.impressions += row.impressions;
    existing.positionWeighted += row.avgPosition * row.impressions;
    byKey.set(key, existing);
  }

  return [...byKey.entries()]
    .map(([key, value]) => ({
      key,
      clicks: value.clicks,
      impressions: value.impressions,
      ctr: value.impressions > 0 ? value.clicks / value.impressions : 0,
      avgPosition: value.impressions > 0 ? value.positionWeighted / value.impressions : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

export function aggregatePagesByUrl(pages: PageMetric[]): AggregatedRow[] {
  return aggregate(pages, (row) => row.page);
}

export function aggregateQueriesByText(queries: SearchQueryMetric[]): AggregatedRow[] {
  return aggregate(queries, (row) => row.query);
}

export function buildGscIndexAuditReportMarkdown(
  data: AppData,
  options: { siteUrl?: string; project?: Project } = {},
): string {
  const scoped = data.gscIndexInspections.filter((row) => {
    if (options.siteUrl) return row.siteUrl === options.siteUrl;
    if (options.project) return row.projectId === options.project.id;
    return true;
  });
  const byUrl = new Map<string, GscIndexInspection[]>();
  for (const row of scoped) {
    const key = `${row.siteUrl}::${row.url}`;
    const rows = byUrl.get(key) ?? [];
    rows.push(row);
    byUrl.set(key, rows);
  }

  const latest: GscIndexInspection[] = [];
  const newProblems: GscIndexInspection[] = [];
  for (const rows of byUrl.values()) {
    rows.sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt));
    latest.push(rows[0]);
    if (rows[0].severity !== "none" && rows[0].issueCode !== "inspection_error") {
      const previous = rows[1];
      if (!previous || previous.issueCode !== rows[0].issueCode) newProblems.push(rows[0]);
    }
  }

  const problems = latest
    .filter((row) => row.severity !== "none")
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.url.localeCompare(b.url));
  const indexed = latest.filter((row) => row.issueCode === "indexed").length;
  const sites = [...new Set(latest.map((row) => row.siteUrl))];
  const byIssue = new Map<GscIndexIssueCode, GscIndexInspection[]>();
  for (const row of problems) {
    const rows = byIssue.get(row.issueCode) ?? [];
    rows.push(row);
    byIssue.set(row.issueCode, rows);
  }

  const title = options.project
    ? `${options.project.name} - GSC index audit`
    : options.siteUrl
      ? `${options.siteUrl} - GSC index audit`
      : "Google Search Console - index audit";
  const lines = [
    `# ${title} - ${new Date().toISOString().slice(0, 10)}`,
    "",
    "## Summary",
    "",
    "```txt",
    `Properties:        ${sites.length}`,
    `URLs inspected:    ${latest.length}`,
    `Indexed:           ${indexed}`,
    `Problems/errors:   ${problems.length}`,
    `New/changed issues:${String(newProblems.length).padStart(5)}`,
    "```",
    "",
  ];

  if (options.project) {
    const sitemapSignals = data.gscSitemaps
      .filter((row) => row.projectId === options.project?.id)
      .map((row) => {
        const raw = row.rawJson as
          | { contents?: Array<{ submitted?: string | number; indexed?: string | number }> }
          | undefined;
        const submitted = (raw?.contents ?? []).reduce((sum, item) => sum + Number(item.submitted ?? 0), 0);
        const sitemapIndexed = (raw?.contents ?? []).reduce((sum, item) => sum + Number(item.indexed ?? 0), 0);
        return { ...row, submitted, sitemapIndexed };
      });
    if (sitemapSignals.length > 0) {
      lines.push("## Sitemap signals", "", "```txt");
      for (const sitemap of sitemapSignals) {
        lines.push(
          `${sitemap.path} | submitted: ${sitemap.submitted} | indexed: ${sitemap.sitemapIndexed} | ` +
            `warnings: ${sitemap.warnings} | errors: ${sitemap.errors}`,
        );
      }
      lines.push("```", "");
    }
  }

  if (latest.length === 0) {
    lines.push("No URL Inspection data found. Run `pnpm run audit:index` first.", "");
    return lines.join("\n");
  }

  lines.push("## Problems by type", "");
  for (const [issueCode, rows] of [...byIssue.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const sortedRows = [...rows].sort(
      (a, b) => Number(isFromSitemap(b)) - Number(isFromSitemap(a)) || a.url.localeCompare(b.url),
    );
    const sitemapCount = rows.filter(isFromSitemap).length;
    lines.push(`### ${issueCode} (${rows.length}; ${sitemapCount} in sitemap)`, "");
    lines.push(getIndexIssueRecommendation(issueCode), "", "```txt");
    for (const row of sortedRows.slice(0, 200)) {
      const context = [
        row.coverageState,
        row.pageFetchState && `fetch=${row.pageFetchState}`,
        row.googleCanonical && row.googleCanonical !== row.url ? `googleCanonical=${row.googleCanonical}` : undefined,
      ]
        .filter(Boolean)
        .join(" | ");
      lines.push(`${row.siteUrl} | ${row.url}${context ? ` | ${context}` : ""}`);
    }
    if (rows.length > 200) lines.push(`... ${rows.length - 200} more URL(s) stored in SQLite.`);
    lines.push("```", "");
  }

  if (newProblems.length > 0) {
    lines.push("## New or changed issues", "", "```txt");
    for (const row of newProblems.slice(0, 200)) {
      lines.push(`${row.issueCode.padEnd(26)} | ${row.siteUrl} | ${row.url}`);
    }
    lines.push("```", "");
  }

  lines.push(
    "## Scope limitations",
    "",
    "```txt",
    "The Search Console API has no bulk Page Indexing report export.",
    "This audit covers URLs discovered through submitted sitemaps, Search Analytics,",
    "stored GSC data and previous audits. URL Inspection reflects Google's indexed",
    "version and is limited to 2,000 requests per property per day.",
    "```",
    "",
  );
  return lines.join("\n");
}

function isFromSitemap(row: GscIndexInspection): boolean {
  return row.discoveredFrom.some((source) => source.startsWith("sitemap:"));
}

function severityRank(severity: GscIndexInspection["severity"]): number {
  return { none: 0, low: 1, medium: 2, high: 3 }[severity];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatRow(row: AggregatedRow): string {
  return `${row.key} | clicks: ${row.clicks} | impr: ${row.impressions} | ctr: ${formatPercent(row.ctr)} | avgPos: ${row.avgPosition.toFixed(1)}`;
}

function formatBreakdownRow(row: GscDimensionBreakdown): string {
  return `${row.key.padEnd(20)} | clicks: ${row.clicks} | impr: ${row.impressions} | ctr: ${formatPercent(row.ctr)} | avgPos: ${row.avgPosition.toFixed(1)}`;
}

function formatGscTrendRows(previous: PageMetric[], latest: PageMetric[], limit: number): string[] {
  const previousByPage = new Map(previous.map((row) => [row.page, row]));
  const lines: string[] = [];

  for (const row of [...latest].sort((a, b) => b.impressions - a.impressions).slice(0, limit)) {
    const before = previousByPage.get(row.page);
    if (!before) continue;

    const clicksDelta = formatDelta(before.clicks, row.clicks, { lowerIsBetter: false });
    const imprDelta = formatDelta(before.impressions, row.impressions, { lowerIsBetter: false });
    const posDelta = formatDelta(before.avgPosition, row.avgPosition, { lowerIsBetter: true, decimals: 1 });

    lines.push(
      `${row.page} | clicks: ${row.clicks} (${clicksDelta}) | impr: ${row.impressions} (${imprDelta}) | avgPos: ${row.avgPosition.toFixed(1)} (${posDelta})`,
    );
  }

  if (lines.length === 0) lines.push("No pages found in both snapshots.");
  return lines;
}

export function buildGscReportMarkdown(
  data: AppData,
  project: Project,
  options: { topPages?: number; topQueries?: number } = {},
): string {
  const topPages = options.topPages ?? 20;
  const topQueries = options.topQueries ?? 30;

  const queries = data.searchQueries.filter((row) => row.projectId === project.id);
  const pages = data.pageMetrics.filter((row) => row.projectId === project.id);
  const snapshots = data.metricSnapshots.filter((row) => row.projectId === project.id && row.source === "gsc");

  const dates = [...new Set([...queries, ...pages].map((row) => row.date))].sort();
  const rangeStart = dates[0] ?? "n/a";
  const rangeEnd = dates[dates.length - 1] ?? "n/a";

  const totals = snapshots.reduce(
    (acc, row) => ({
      clicks: acc.clicks + (row.clicks ?? 0),
      impressions: acc.impressions + (row.impressions ?? 0),
      positionWeighted: acc.positionWeighted + (row.avgPosition ?? 0) * (row.impressions ?? 0),
    }),
    { clicks: 0, impressions: 0, positionWeighted: 0 },
  );
  const avgPosition = totals.impressions > 0 ? totals.positionWeighted / totals.impressions : 0;
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;

  const pageRows = aggregatePagesByUrl(pages).slice(0, topPages);
  const queryRows = aggregateQueriesByText(queries).slice(0, topQueries);

  const pageSnapshotDates = [...new Set(pages.map((row) => row.date))].sort();
  const trendLatestDate = pageSnapshotDates[pageSnapshotDates.length - 1];
  const trendPreviousDate = pageSnapshotDates[pageSnapshotDates.length - 2];

  const breakdowns = data.gscDimensionBreakdowns.filter((row) => row.projectId === project.id);
  const latestRangeEnd = breakdowns.reduce((max, row) => (row.rangeEnd > max ? row.rangeEnd : max), "");
  const latestBreakdowns = breakdowns.filter((row) => row.rangeEnd === latestRangeEnd);
  const deviceRows = latestBreakdowns.filter((row) => row.dimension === "device").sort((a, b) => b.impressions - a.impressions);
  const countryRows = latestBreakdowns
    .filter((row) => row.dimension === "country")
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15);
  const appearanceRows = latestBreakdowns
    .filter((row) => row.dimension === "searchAppearance")
    .sort((a, b) => b.impressions - a.impressions);

  const sitemaps = data.gscSitemaps.filter((row) => row.projectId === project.id);

  const lines: string[] = [];
  lines.push(`# ${project.name} - GSC report - ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("Project:");
  lines.push("");
  lines.push("```txt");
  lines.push(project.websiteUrl ?? project.slug);
  lines.push("```");
  lines.push("");
  lines.push("Source:");
  lines.push("");
  lines.push("```txt");
  lines.push(`Google Search Console: ${project.gscProperty ?? "(not configured)"}`);
  lines.push("```");
  lines.push("");
  lines.push("Period covered by current data:");
  lines.push("");
  lines.push("```txt");
  lines.push(`${rangeStart} -> ${rangeEnd}`);
  lines.push("```");
  lines.push("");
  lines.push("## GSC summary");
  lines.push("");
  lines.push("```txt");
  lines.push(`Clicks:        ${totals.clicks.toLocaleString("it-IT")}`);
  lines.push(`Impressions:   ${totals.impressions.toLocaleString("it-IT")}`);
  lines.push(`CTR:           ${formatPercent(ctr)}`);
  lines.push(`Avg position:  ${avgPosition.toFixed(1)}`);
  lines.push("```");
  lines.push("");
  lines.push(`## Top pages by impressions (top ${pageRows.length})`);
  lines.push("");
  lines.push("```txt");
  for (const row of pageRows) lines.push(formatRow(row));
  lines.push("```");
  lines.push("");
  lines.push(`## Top queries by impressions (top ${queryRows.length})`);
  lines.push("");
  lines.push("```txt");
  for (const row of queryRows) lines.push(formatRow(row));
  lines.push("```");
  lines.push("");

  if (trendPreviousDate) {
    lines.push(`## Trend (${trendPreviousDate} -> ${trendLatestDate})`);
    lines.push("");
    lines.push("```txt");
    const previousPages = pages.filter((row) => row.date === trendPreviousDate);
    const latestPages = pages.filter((row) => row.date === trendLatestDate);
    for (const row of formatGscTrendRows(previousPages, latestPages, topPages)) lines.push(row);
    lines.push("```");
    lines.push("");
  }

  if (deviceRows.length > 0 || countryRows.length > 0 || appearanceRows.length > 0) {
    lines.push(`## Breakdowns (range ending ${latestRangeEnd || "n/a"})`);
    lines.push("");

    if (deviceRows.length > 0) {
      lines.push("### By device");
      lines.push("");
      lines.push("```txt");
      for (const row of deviceRows) lines.push(formatBreakdownRow(row));
      lines.push("```");
      lines.push("");
    }

    if (countryRows.length > 0) {
      lines.push(`### By country (top ${countryRows.length})`);
      lines.push("");
      lines.push("```txt");
      for (const row of countryRows) lines.push(formatBreakdownRow(row));
      lines.push("```");
      lines.push("");
    }

    if (appearanceRows.length > 0) {
      lines.push("### By search appearance");
      lines.push("");
      lines.push("```txt");
      for (const row of appearanceRows) lines.push(formatBreakdownRow(row));
      lines.push("```");
      lines.push("");
    }
  }

  if (sitemaps.length > 0) {
    lines.push("## Sitemaps");
    lines.push("");
    lines.push("```txt");
    for (const row of sitemaps) {
      const flags = [row.isSitemapsIndex ? "index" : undefined, row.isPending ? "pending" : undefined]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `${row.path} | submitted: ${row.lastSubmitted ?? "n/a"} | warnings: ${row.warnings} | errors: ${row.errors}${flags ? ` | ${flags}` : ""}`,
      );
    }
    lines.push("```");
    lines.push("");
  }

  lines.push("## Notes");
  lines.push("");
  lines.push("```txt");
  lines.push("This is a raw data dump generated by `pnpm run report`.");
  lines.push("Use it as the data section of a full report; add findings, priorities");
  lines.push("and recommended actions by hand (or ask the assistant to extend it).");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

function formatKeywordRow(row: AppKeywordMetric): string {
  const rank = row.appRank == null ? "-" : `#${row.appRank}`;
  return (
    `${row.keyword.padEnd(30)} | ${row.country.toUpperCase()} | ` +
    `pop: ${row.popularityScore} | diff: ${row.difficultyScore} (${row.difficultyLabel ?? "?"}) | ` +
    `opp: ${row.opportunityScore} | ${row.classification ?? "?"} | rank: ${rank}`
  );
}

function formatTrendRows(previous: AppKeywordMetric[], latest: AppKeywordMetric[]): string[] {
  const previousByKey = new Map(previous.map((row) => [`${row.country.toLowerCase()}:${row.keyword.toLowerCase()}`, row]));
  const lines: string[] = [];

  for (const row of [...latest].sort((a, b) => b.opportunityScore - a.opportunityScore)) {
    const before = previousByKey.get(`${row.country.toLowerCase()}:${row.keyword.toLowerCase()}`);
    if (!before) continue;

    const rankDelta = formatDelta(before.appRank ?? null, row.appRank ?? null, { lowerIsBetter: true });
    const oppDelta = formatDelta(before.opportunityScore, row.opportunityScore, { lowerIsBetter: false });
    const popDelta = formatDelta(before.popularityScore, row.popularityScore, { lowerIsBetter: false });
    const rank = row.appRank == null ? "-" : `#${row.appRank}`;

    lines.push(
      `${row.keyword.padEnd(30)} | ${row.country.toUpperCase()} | ` +
        `rank: ${rank} (${rankDelta}) | opp: ${row.opportunityScore} (${oppDelta}) | pop: ${row.popularityScore} (${popDelta})`,
    );
  }

  if (lines.length === 0) lines.push("No keywords found in both snapshots.");
  return lines;
}

function formatDelta(
  before: number | null,
  after: number | null,
  options: { lowerIsBetter: boolean; decimals?: number },
): string {
  if (before == null || after == null) return "n/a";
  const decimals = options.decimals ?? 0;
  const diff = Number((after - before).toFixed(decimals));
  if (diff === 0) return "=";
  const improved = options.lowerIsBetter ? diff < 0 : diff > 0;
  const arrow = improved ? "up" : "down";
  return `${arrow} ${diff > 0 ? "+" : ""}${diff}`;
}

export function buildAsoReportMarkdown(data: AppData, project: Project): string {
  const keywords = data.appKeywords
    .filter((row) => row.projectId === project.id)
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.date.localeCompare(a.date));

  const dates = [...new Set(keywords.map((row) => row.date))].sort();
  const latestDate = dates[dates.length - 1];
  const latest = keywords.filter((row) => row.date === latestDate);

  const byClassification = new Map<string, AppKeywordMetric[]>();
  for (const row of latest) {
    const list = byClassification.get(row.classification ?? "unknown") ?? [];
    list.push(row);
    byClassification.set(row.classification ?? "unknown", list);
  }

  const lines: string[] = [];
  lines.push(`# ${project.name} - ASO report - ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("Source:");
  lines.push("");
  lines.push("```txt");
  lines.push("RespectASO (local instance, App Store / iTunes Search API data)");
  lines.push(`Tracked app id: ${project.appStoreTrackId ?? "(not configured)"}`);
  lines.push(`Configured keywords: ${(project.asoKeywords ?? []).join(", ") || "(none configured)"}`);
  lines.push(`Configured countries: ${(project.asoCountries ?? []).join(", ") || "(default: it)"}`);
  lines.push("```");
  lines.push("");

  if (latest.length === 0) {
    lines.push("No ASO keyword data found for this project yet.");
    lines.push("");
    lines.push("```txt");
    lines.push("Configure asoKeywords / asoCountries on the project, make sure RespectASO");
    lines.push("is running (`docker compose up -d`), then run `pnpm run sync:aso`.");
    lines.push("```");
    lines.push("");
    return lines.join("\n");
  }

  lines.push(`Latest data snapshot: ${latestDate}`);
  lines.push("");
  lines.push("## Keywords by opportunity score (latest snapshot)");
  lines.push("");
  lines.push("```txt");
  for (const row of latest.sort((a, b) => b.opportunityScore - a.opportunityScore)) {
    lines.push(formatKeywordRow(row));
  }
  lines.push("```");
  lines.push("");

  const previousDate = dates[dates.length - 2];
  if (previousDate) {
    const previous = keywords.filter((row) => row.date === previousDate);
    lines.push(`## Trend (${previousDate} -> ${latestDate})`);
    lines.push("");
    lines.push("```txt");
    for (const row of formatTrendRows(previous, latest)) {
      lines.push(row);
    }
    lines.push("```");
    lines.push("");
  }

  lines.push("## Breakdown by classification");
  lines.push("");
  lines.push("```txt");
  for (const [classification, rows] of [...byClassification.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`${classification.padEnd(18)} ${rows.length} keyword(s): ${rows.map((r) => `${r.keyword} (${r.country})`).join(", ")}`);
  }
  lines.push("```");
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("```txt");
  lines.push("This is a raw data dump generated by `pnpm run report`.");
  lines.push("Classification reference:");
  lines.push("  sweet_spot       high popularity + low difficulty -> ideal target");
  lines.push("  good_target      good balance of opportunity");
  lines.push("  hidden_gem       lower popularity but very easy to rank -> niche win");
  lines.push("  high_competition high popularity but very hard -> avoid unless strong brand");
  lines.push("  moderate         average on both dimensions");
  lines.push("  low_volume       few searches -> only relevant for very niche apps");
  lines.push("  avoid            not worth targeting");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

export function buildAscReportMarkdown(data: AppData, project: Project): string {
  const metadata = data.ascMetadataSnapshots
    .filter((row) => row.projectId === project.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const experiments = data.ascExperiments
    .filter((row) => row.projectId === project.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines: string[] = [];
  lines.push(`# ${project.name} - App Store Connect report - ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");

  if (metadata.length === 0 && experiments.length === 0) {
    lines.push("No App Store Connect data pulled yet for this project.");
    lines.push("");
    lines.push("```txt");
    lines.push("Run `pnpm run aso:pull-copy -- --slug " + project.slug + "` and/or");
    lines.push("`pnpm run asc:experiments -- --slug " + project.slug + "` first.");
    lines.push("```");
    lines.push("");
    return lines.join("\n");
  }

  if (metadata.length > 0) {
    const byLocale = new Map<string, typeof metadata>();
    for (const row of metadata) {
      const list = byLocale.get(row.locale) ?? [];
      list.push(row);
      byLocale.set(row.locale, list);
    }

    lines.push("## Store copy (latest snapshot per locale)");
    lines.push("");
    for (const [locale, rows] of byLocale) {
      const latest = rows[0];
      lines.push(`### ${locale} (${latest.kind}, ${latest.createdAt.slice(0, 10)})`);
      lines.push("");
      lines.push("```txt");
      lines.push(`Name:       ${latest.name ?? "(unchanged/unknown)"}`);
      lines.push(`Subtitle:   ${latest.subtitle ?? "(unchanged/unknown)"}`);
      lines.push(`Keywords:   ${latest.keywords ?? "(unchanged/unknown)"}`);
      lines.push(`Promo text: ${latest.promotionalText ?? "(unchanged/unknown)"}`);
      lines.push(`Description: ${(latest.description ?? "").slice(0, 200)}${(latest.description?.length ?? 0) > 200 ? "..." : ""}`);
      lines.push("```");
      lines.push("");
    }
  }

  if (experiments.length > 0) {
    lines.push("## Product Page Optimization experiments");
    lines.push("");
    lines.push("```txt");
    for (const exp of experiments) {
      const treatments = data.ascExperimentTreatments.filter((t) => t.experimentId === exp.id);
      lines.push(`${exp.name} [${exp.state}]${exp.elementType ? ` (${exp.elementType})` : ""}`);
      for (const t of treatments) {
        lines.push(`  - ${t.name}${t.state ? ` [${t.state}]` : ""}`);
      }
    }
    lines.push("```");
    lines.push("");
    lines.push("```txt");
    lines.push("Apple only exposes test winners/conversion metrics in the App Store Connect UI");
    lines.push("(App Analytics > Product Page Optimization Tests), not via this API — check there for results.");
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

export function buildGrowthReportMarkdown(data: AppData, project: Project): string {
  const vitals = data.playVitalsMetrics.filter((row) => row.projectId === project.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const installStats = data.playInstallStats.filter((row) => row.projectId === project.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const ascAnalytics = data.ascAnalyticsMetrics.filter((row) => row.projectId === project.id).sort((a, b) => (a.date < b.date ? -1 : 1));

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# ${project.name} - Growth report - ${today}`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("```txt");
  lines.push(`Play Console package: ${project.playConsolePackageName ?? "(not configured)"}`);
  lines.push(`App Store Connect id: ${project.appStoreTrackId ?? "(not configured)"}`);
  lines.push("```");
  lines.push("");

  if (vitals.length === 0 && installStats.length === 0 && ascAnalytics.length === 0) {
    lines.push("No growth data found for this project yet.");
    lines.push("");
    lines.push("```txt");
    lines.push("Run `pnpm run sync:play-vitals`, `pnpm run sync:play-stats` and/or");
    lines.push("`pnpm run sync:asc-analytics` first (requires playConsolePackageName /");
    lines.push("appStoreTrackId to be configured on the project).");
    lines.push("```");
    lines.push("");
    return lines.join("\n");
  }

  if (installStats.length > 0) {
    const totalInstalls = installStats.reduce((sum, row) => sum + (row.installs ?? 0), 0);
    const totalUninstalls = installStats.reduce((sum, row) => sum + (row.uninstalls ?? 0), 0);
    lines.push(`## Play Store installs/uninstalls (last ${Math.min(installStats.length, 30)} days)`);
    lines.push("");
    lines.push("```txt");
    lines.push(`Total installs:   ${totalInstalls.toLocaleString("it-IT")}`);
    lines.push(`Total uninstalls: ${totalUninstalls.toLocaleString("it-IT")}`);
    lines.push("```");
    lines.push("");
    lines.push("```txt");
    for (const row of installStats.slice(-30)) {
      lines.push(
        `${row.date} | installs: ${row.installs ?? 0} | uninstalls: ${row.uninstalls ?? 0} | active device installs: ${row.activeDeviceInstalls ?? "n/a"}`,
      );
    }
    lines.push("```");
    lines.push("");
  }

  if (vitals.length > 0) {
    const latest = vitals[vitals.length - 1];
    lines.push("## Play Store vitals (crash/ANR rate)");
    lines.push("");
    lines.push("```txt");
    lines.push(`Latest date:   ${latest.date}`);
    lines.push(`Crash rate:    ${latest.crashRate !== undefined ? formatPercent(latest.crashRate) : "n/a"}`);
    lines.push(`ANR rate:      ${latest.anrRate !== undefined ? formatPercent(latest.anrRate) : "n/a"}`);
    lines.push("```");
    lines.push("");
  }

  if (ascAnalytics.length > 0) {
    const totalDownloads = ascAnalytics.reduce((sum, row) => sum + (row.downloads ?? 0), 0);
    const latest = ascAnalytics[ascAnalytics.length - 1];
    lines.push(`## App Store downloads/retention (last ${Math.min(ascAnalytics.length, 30)} days)`);
    lines.push("");
    lines.push("```txt");
    lines.push(`Total downloads:   ${totalDownloads.toLocaleString("it-IT")}`);
    lines.push(`Retention day 1:   ${latest.retentionDay1 !== undefined ? formatPercent(latest.retentionDay1) : "n/a"}`);
    lines.push(`Retention day 7:   ${latest.retentionDay7 !== undefined ? formatPercent(latest.retentionDay7) : "n/a"}`);
    lines.push(`Retention day 28:  ${latest.retentionDay28 !== undefined ? formatPercent(latest.retentionDay28) : "n/a"}`);
    lines.push("```");
    lines.push("");
    lines.push("```txt");
    for (const row of ascAnalytics.slice(-30)) {
      lines.push(`${row.date} | downloads: ${row.downloads ?? 0}`);
    }
    lines.push("```");
    lines.push("");
  }

  lines.push("## Notes");
  lines.push("");
  lines.push("```txt");
  lines.push("This is a raw data dump generated by `pnpm run report`.");
  lines.push("Android install/uninstall counts come from the Play Console statistics CSV");
  lines.push("export (Cloud Storage), not a REST API -- see docs/guide/monetization-workflow.md.");
  lines.push("Crash/ANR rate comes from the Play Developer Reporting API (vitals).");
  lines.push("iOS crash data is not exposed by any public Apple API and is not included here.");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

function formatMoney(amount: number, currency?: string): string {
  if (!currency) {
    return amount.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  try {
    return amount.toLocaleString("it-IT", { style: "currency", currency });
  } catch {
    return `${amount.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

function sumRevenue(rows: Array<{ revenue?: number }>): number {
  return rows.reduce((total, row) => total + (row.revenue ?? 0), 0);
}

export function buildMonetizationReportMarkdown(data: AppData, project: Project): string {
  const admobNetwork = data.metricSnapshots
    .filter((row) => row.projectId === project.id && row.source === "admob")
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const admob = getAdmobRevenueRows(data, project.id);
  const mediation = data.admobMediationMetrics.filter((row) => row.projectId === project.id);
  const revenuecat = data.metricSnapshots
    .filter((row) => row.projectId === project.id && row.source === "revenuecat")
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# ${project.name} - Monetization report - ${today}`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("```txt");
  lines.push(`AdMob app id (Android): ${project.admobAppId ?? "(not configured)"}`);
  lines.push(`AdMob app id (iOS):     ${project.admobAppIdIos ?? "(not configured)"}`);
  lines.push(`RevenueCat project id: ${project.revenueCatProjectId ?? "(not configured)"}`);
  lines.push("```");
  lines.push("");

  if (admob.length === 0 && revenuecat.length === 0) {
    lines.push("No monetization data found for this project yet.");
    lines.push("");
    lines.push("```txt");
    lines.push("Configure admobAppId/revenueCatProjectId on the project, set the");
    lines.push("ADMOB_*/REVENUECAT_API_KEY env vars in .env, then run `pnpm run sync`.");
    lines.push("```");
    lines.push("");
    return lines.join("\n");
  }

  if (admob.length > 0) {
    const currency = admob.find((row) => row.currency)?.currency;
    const recentAdmob = admob.slice(-30);
    const recentDates = new Set(recentAdmob.map((row) => row.date));
    const recentMediation = mediation.filter((row) => recentDates.has(row.date));
    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7);
    const previousMonthPrefix = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
    const monthTotal = sumRevenue(admob.filter((row) => row.date.startsWith(monthPrefix)));
    const previousMonthTotal = sumRevenue(admob.filter((row) => row.date.startsWith(previousMonthPrefix)));
    const latest = admob[admob.length - 1];

    lines.push("## AdMob - total app ads (mediation)");
    lines.push("");
    lines.push("```txt");
    lines.push(`Last sync date:        ${latest.date}`);
    lines.push(`Revenue (that day):    ${formatMoney(latest.revenue ?? 0, currency)}`);
    lines.push(`Revenue (this month):  ${formatMoney(monthTotal, currency)}`);
    lines.push(`Revenue (prev. month): ${formatMoney(previousMonthTotal, currency)}`);
    lines.push("```");
    lines.push("");
    lines.push(`## AdMob daily total (last ${recentAdmob.length} days)`);
    lines.push("");
    lines.push("```txt");
    for (const row of recentAdmob) {
      const dailyMediation = recentMediation.filter((metric) => metric.date === row.date);
      const impressions = dailyMediation.length > 0
        ? dailyMediation.reduce((total, metric) => total + (metric.impressions ?? 0), 0)
        : (admobNetwork.find((metric) => metric.date === row.date)?.impressions ?? 0);
      const clicks = dailyMediation.length > 0
        ? dailyMediation.reduce((total, metric) => total + (metric.clicks ?? 0), 0)
        : (admobNetwork.find((metric) => metric.date === row.date)?.clicks ?? 0);
      lines.push(
        `${row.date} | revenue: ${formatMoney(row.revenue, currency)} | impressions: ${impressions.toLocaleString("it-IT")} | clicks: ${clicks}`,
      );
    }
    lines.push("```");
    lines.push("");

    if (recentMediation.length > 0) {
      const breakdown = new Map<string, { source: string; format: string; revenue: number; impressions: number; clicks: number }>();
      for (const row of recentMediation) {
        const format = row.format ?? "unknown";
        const key = `${row.adSourceName}::${format}`;
        const current = breakdown.get(key) ?? {
          source: row.adSourceName,
          format,
          revenue: 0,
          impressions: 0,
          clicks: 0,
        };
        current.revenue += row.estimatedEarnings ?? 0;
        current.impressions += row.impressions ?? 0;
        current.clicks += row.clicks ?? 0;
        breakdown.set(key, current);
      }

      lines.push(`## AdMob mediation breakdown (same ${recentAdmob.length}-day range)`);
      lines.push("");
      lines.push("```txt");
      for (const row of [...breakdown.values()].sort((a, b) => b.revenue - a.revenue)) {
        const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
        lines.push(
          `${row.source} | ${row.format} | revenue: ${formatMoney(row.revenue, currency)} | ` +
            `impressions: ${row.impressions.toLocaleString("it-IT")} | clicks: ${row.clicks} | ctr: ${ctr.toFixed(2)}%`,
        );
      }
      lines.push("```");
      lines.push("");

      const networkTotal = sumRevenue(admobNetwork.filter((row) => recentDates.has(row.date)));
      const mediationTotal = recentAdmob.reduce((total, row) => total + row.revenue, 0);
      lines.push("## AdMob reconciliation");
      lines.push("");
      lines.push("```txt");
      lines.push(`Network Report (AdMob Network only): ${formatMoney(networkTotal, currency)}`);
      lines.push(`Mediation Report (complete total):   ${formatMoney(mediationTotal, currency)}`);
      lines.push("Use the Mediation Report total for business revenue when mediated sources are active.");
      lines.push("```");
      lines.push("");
    }
  }

  if (revenuecat.length > 0) {
    const currency = revenuecat.find((row) => row.currency)?.currency;
    const latest = revenuecat[revenuecat.length - 1];

    lines.push("## RevenueCat");
    lines.push("");
    lines.push("```txt");
    lines.push(`Last sync date:            ${latest.date}`);
    lines.push(`MRR:                       ${formatMoney(latest.mrr ?? 0, currency)}`);
    lines.push(`Active subscribers:        ${latest.activeSubscribers ?? 0}`);
    lines.push(`Active trials:             ${latest.activeTrials ?? 0}`);
    lines.push(`New customers (latest):    ${latest.newCustomers ?? 0}`);
    lines.push(`Revenue (rolling 28 days): ${formatMoney(latest.revenue ?? 0, currency)}`);
    lines.push("```");
    lines.push("");
    lines.push(`## RevenueCat MRR trend (last ${Math.min(revenuecat.length, 30)} days)`);
    lines.push("");
    lines.push("```txt");
    for (const row of revenuecat.slice(-30)) {
      lines.push(`${row.date} | mrr: ${formatMoney(row.mrr ?? 0, currency)} | active subs: ${row.activeSubscribers ?? 0}`);
    }
    lines.push("```");
    lines.push("");
  }

  lines.push("## Notes");
  lines.push("");
  lines.push("```txt");
  lines.push("This is a raw data dump generated by `pnpm run report`.");
  lines.push("RevenueCat's 'revenue (rolling 28 days)' is a rolling window, not a daily");
  lines.push("total -- never sum it across the dates listed above. AdMob mediation revenue");
  lines.push("is a true daily total and includes AdMob Network plus third-party sources.");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
