import type {
  AppData,
  AppKeywordMetric,
  GscDimensionBreakdown,
  MetricSnapshot,
  PageMetric,
  Project,
  SearchQueryMetric,
} from "@/lib/types";

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

function sumRevenue(rows: MetricSnapshot[]): number {
  return rows.reduce((total, row) => total + (row.revenue ?? 0), 0);
}

export function buildMonetizationReportMarkdown(data: AppData, project: Project): string {
  const admob = data.metricSnapshots
    .filter((row) => row.projectId === project.id && row.source === "admob")
    .sort((a, b) => (a.date < b.date ? -1 : 1));
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
  lines.push(`AdMob app id: ${project.admobAppId ?? "(not configured)"}`);
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
    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7);
    const previousMonthPrefix = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
    const monthTotal = sumRevenue(admob.filter((row) => row.date.startsWith(monthPrefix)));
    const previousMonthTotal = sumRevenue(admob.filter((row) => row.date.startsWith(previousMonthPrefix)));
    const latest = admob[admob.length - 1];

    lines.push("## AdMob");
    lines.push("");
    lines.push("```txt");
    lines.push(`Last sync date:        ${latest.date}`);
    lines.push(`Revenue (that day):    ${formatMoney(latest.revenue ?? 0, currency)}`);
    lines.push(`Revenue (this month):  ${formatMoney(monthTotal, currency)}`);
    lines.push(`Revenue (prev. month): ${formatMoney(previousMonthTotal, currency)}`);
    lines.push("```");
    lines.push("");
    lines.push(`## AdMob daily revenue (last ${Math.min(admob.length, 30)} days)`);
    lines.push("");
    lines.push("```txt");
    for (const row of admob.slice(-30)) {
      lines.push(
        `${row.date} | revenue: ${formatMoney(row.revenue ?? 0, currency)} | impressions: ${(row.impressions ?? 0).toLocaleString("it-IT")} | clicks: ${row.clicks ?? 0}`,
      );
    }
    lines.push("```");
    lines.push("");
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
  lines.push("total -- never sum it across the dates listed above. AdMob's daily revenue");
  lines.push("is a true daily total and safe to sum, as done for the monthly totals.");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
