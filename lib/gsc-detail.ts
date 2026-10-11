import type { AppData, PageMetric, SearchQueryMetric } from "@/lib/types";

type GscDetailRow = PageMetric | SearchQueryMetric;

// Pre-fix records used to attach a multi-day aggregate to its endDate. They
// contain only the raw Google API payload (no grain metadata). Keep them in
// SQLite for audit/recovery, but NEVER mix them into daily sums or trends.
export function isDailyGscDetail(row: GscDetailRow): boolean {
  const raw = row.rawJson;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const meta = (raw as { _openfindability?: { grain?: string; version?: number } })._openfindability;
  return meta?.grain === "day" && meta.version === 2;
}

export function dailyGscPages(rows: PageMetric[]): PageMetric[] {
  return rows.filter(isDailyGscDetail);
}

export function dailyGscQueries(rows: SearchQueryMetric[]): SearchQueryMetric[] {
  return rows.filter(isDailyGscDetail);
}

function cutoffFromDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return date.toISOString().slice(0, 10);
}

function latestGscDayByProject(data: AppData): Map<string, string> {
  const latest = new Map<string, string>();
  const record = (projectId: string, date: string) => {
    if (!latest.has(projectId) || date > latest.get(projectId)!) latest.set(projectId, date);
  };
  for (const row of data.metricSnapshots) {
    if (row.source === "gsc") record(row.projectId, row.date);
  }
  for (const row of dailyGscPages(data.pageMetrics)) record(row.projectId, row.date);
  for (const row of dailyGscQueries(data.searchQueries)) record(row.projectId, row.date);
  return latest;
}

function aggregateRecent<T extends GscDetailRow>(
  data: AppData,
  rows: T[],
  keyOf: (row: T) => string,
  days: number,
): T[] {
  const latest = latestGscDayByProject(data);
  const buckets = new Map<string, { template: T; clicks: number; impressions: number; weightedPosition: number }>();
  for (const row of rows) {
    if (!isDailyGscDetail(row)) continue;
    const lastDay = latest.get(row.projectId);
    if (!lastDay || row.date < cutoffFromDay(lastDay, days) || row.date > lastDay) continue;
    const key = `${row.projectId}\u0000${keyOf(row)}`;
    const current = buckets.get(key) ?? { template: row, clicks: 0, impressions: 0, weightedPosition: 0 };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.weightedPosition += row.avgPosition * row.impressions;
    buckets.set(key, current);
  }
  return [...buckets.values()].map(({ template, clicks, impressions, weightedPosition }) => ({
    ...template,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    avgPosition: impressions > 0 ? weightedPosition / impressions : 0,
    rawJson: { _openfindability: { grain: "derived_window", days }, latestDetail: template.rawJson },
  }));
}

// These aggregates are ONLY for reports/opportunity scoring: never store their
// "date" (the last constituent day) as a daily observation in SQLite.
export function recentGscDetails(data: AppData, days = 28) {
  return {
    queries: aggregateRecent(data, data.searchQueries, (row) => {
      const query = row as SearchQueryMetric;
      return `${query.query}\u0000${query.page ?? ""}`;
    }, days) as SearchQueryMetric[],
    pages: aggregateRecent(data, data.pageMetrics, (row) => (row as PageMetric).page, days) as PageMetric[],
  };
}
