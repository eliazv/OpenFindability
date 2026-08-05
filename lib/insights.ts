import { createId } from "@/lib/id";
import type { AppData, GscIndexInspection, MetricSnapshot, Opportunity, SourceType } from "@/lib/types";

export function getLatestGscIndexInspections(
  data: AppData,
  filter: { projectId?: string; siteUrl?: string } = {},
): GscIndexInspection[] {
  const latest = new Map<string, GscIndexInspection>();
  for (const row of data.gscIndexInspections) {
    if (filter.projectId && row.projectId !== filter.projectId) continue;
    if (filter.siteUrl && row.siteUrl !== filter.siteUrl) continue;
    const key = `${row.siteUrl}::${row.url}`;
    const current = latest.get(key);
    if (!current || row.inspectedAt > current.inspectedAt) latest.set(key, row);
  }
  return [...latest.values()];
}

export function buildOpportunities(data: AppData): Opportunity[] {
  const detectedAt = new Date().toISOString();
  const opportunities: Opportunity[] = [];

  for (const query of data.searchQueries) {
    const ctrPercent = query.ctr * 100;
    const potentialClicks = computePotentialClicks(query.impressions, ctrPercent, query.avgPosition);

    if (query.impressions >= 1000 && query.ctr < 0.012) {
      opportunities.push({
        id: createId("opp"),
        projectId: query.projectId,
        type: "low_ctr_query",
        title: `CTR basso per "${query.query}"`,
        description: `${query.impressions.toLocaleString("it-IT")} impression, ${query.clicks} click e CTR ${(query.ctr * 100).toFixed(1)}%. Click potenziali stimati: ${potentialClicks.toLocaleString("it-IT")}. Migliora title, meta description o intento della pagina.`,
        severity: query.impressions >= 3000 ? "high" : "medium",
        score: Math.max(potentialClicks, Math.round(query.impressions * (0.02 - query.ctr))),
        status: "open",
        detectedAt,
        rawJson: query,
      });
    }

    if (query.avgPosition >= 5 && query.avgPosition <= 15 && query.impressions >= 500) {
      opportunities.push({
        id: createId("opp"),
        projectId: query.projectId,
        type: "striking_distance_query",
        title: `Query vicina alla prima pagina: "${query.query}"`,
        description: `Posizione media ${query.avgPosition.toFixed(1)} con ${query.impressions.toLocaleString("it-IT")} impression. Potrebbe bastare aggiornare contenuto, heading e linking interno.`,
        severity: query.avgPosition <= 10 ? "high" : "medium",
        score: Math.round(query.impressions / Math.max(query.avgPosition, 1)),
        status: "open",
        detectedAt,
        rawJson: query,
      });
    }

    if (query.clicks === 0 && query.impressions >= 80 && query.avgPosition <= 15) {
      opportunities.push({
        id: createId("opp"),
        projectId: query.projectId,
        type: "zero_click_query",
        title: `Query con impression ma zero click: "${query.query}"`,
        description: `${query.impressions.toLocaleString("it-IT")} impression, posizione media ${query.avgPosition.toFixed(1)} e nessun click. Controlla se la pagina risponde davvero all'intento.`,
        severity: query.impressions >= 300 ? "medium" : "low",
        score: Math.round(query.impressions / Math.max(query.avgPosition, 1)),
        status: "open",
        detectedAt,
        rawJson: query,
      });
    }

    if (query.avgPosition > 10 && query.avgPosition <= 20 && query.impressions >= 100) {
      opportunities.push({
        id: createId("opp"),
        projectId: query.projectId,
        type: "page_two_query",
        title: `Query in pagina 2: "${query.query}"`,
        description: `Posizione media ${query.avgPosition.toFixed(1)} con ${query.impressions.toLocaleString("it-IT")} impression. Valuta contenuto dedicato, aggiornamento pagina o linking interno.`,
        severity: query.impressions >= 500 ? "medium" : "low",
        score: Math.round(query.impressions / Math.max(query.avgPosition - 9, 1)),
        status: "open",
        detectedAt,
        rawJson: query,
      });
    }
  }

  for (const page of data.pageMetrics) {
    if (page.impressions >= 3000 && page.ctr < 0.01) {
      opportunities.push({
        id: createId("opp"),
        projectId: page.projectId,
        type: "declining_page",
        title: `Pagina con visibilita' ma pochi click: ${page.page}`,
        description: `${page.impressions.toLocaleString("it-IT")} impression e CTR ${(page.ctr * 100).toFixed(1)}%. Controlla snippet, search intent e copertura query.`,
        severity: "medium",
        score: Math.round(page.impressions * (0.015 - page.ctr)),
        status: "open",
        detectedAt,
        rawJson: page,
      });
    }
  }

  opportunities.push(...buildCannibalizationOpportunities(data, detectedAt));

  return opportunities.sort((a, b) => b.score - a.score).slice(0, 50);
}

export function summarizeProject(data: AppData, projectId: string) {
  const snapshots = data.metricSnapshots.filter((metric) => metric.projectId === projectId);
  const gsc = snapshots.filter((metric) => metric.source === "gsc");
  const umami = snapshots.filter((metric) => metric.source === "umami");
  const admob = snapshots.filter((metric) => metric.source === "admob");
  const revenuecat = snapshots.filter((metric) => metric.source === "revenuecat");
  const latestRevenueCat = latestByDate(revenuecat);
  const opportunities = data.opportunities.filter((opportunity) => opportunity.projectId === projectId);

  return {
    clicks: sum(gsc, "clicks"),
    impressions: sum(gsc, "impressions"),
    visitors: sum(umami, "visitors"),
    pageviews: sum(umami, "pageviews"),
    adRevenue: sum(admob, "revenue"),
    adCurrency: admob.find((metric) => metric.currency)?.currency,
    mrr: latestRevenueCat?.mrr,
    activeSubscribers: latestRevenueCat?.activeSubscribers,
    subscriptionRevenue28Days: latestRevenueCat?.revenue,
    subscriptionCurrency: latestRevenueCat?.currency,
    opportunities: opportunities.length,
    highPriority: opportunities.filter((opportunity) => opportunity.severity === "high").length,
  };
}

// RevenueCat's `revenue` field is a rolling 28-day window, not a true daily total: summing it
// across snapshots would double-count, so monetization totals use only the latest snapshot per
// project. AdMob's `revenue` is a true daily total and is safe to sum across dates/projects.
export function summarizeMonetization(data: AppData) {
  const admob = data.metricSnapshots.filter((metric) => metric.source === "admob");
  const revenuecat = data.metricSnapshots.filter((metric) => metric.source === "revenuecat");

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const monthPrefix = now.toISOString().slice(0, 7);
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthPrefix = previousMonthDate.toISOString().slice(0, 7);

  const latestRevenueCatByProject = groupLatestByProject(revenuecat);

  return {
    adRevenueYesterday: sum(admob.filter((metric) => metric.date === yesterdayStr), "revenue"),
    adRevenueMonth: sum(admob.filter((metric) => metric.date.startsWith(monthPrefix)), "revenue"),
    adRevenuePreviousMonth: sum(admob.filter((metric) => metric.date.startsWith(previousMonthPrefix)), "revenue"),
    adCurrency: admob.find((metric) => metric.currency)?.currency,
    mrr: sum(latestRevenueCatByProject, "mrr"),
    activeSubscribers: sum(latestRevenueCatByProject, "activeSubscribers"),
    subscriptionRevenue28Days: sum(latestRevenueCatByProject, "revenue"),
    subscriptionCurrency: latestRevenueCatByProject.find((metric) => metric.currency)?.currency,
  };
}

// Daily trend points for charts, summed across projects. AdMob's `revenue` is a true daily
// total (safe to sum). RevenueCat's `mrr`/`activeSubscribers` are point-in-time gauges synced
// once per day per project, so summing them across projects on the same date is also safe; only
// RevenueCat's rolling `revenue` field must never be summed this way.
export type TrendPoint = { date: string; value: number };

export function getAdmobRevenueTrend(data: AppData, days = 30): TrendPoint[] {
  const admob = data.metricSnapshots.filter((metric) => metric.source === "admob" && metric.date >= cutoffDate(days));
  return sumByDate(groupLatestByProjectAndDate(admob), "revenue");
}

export function getRevenueCatMrrTrend(data: AppData, days = 30): TrendPoint[] {
  const revenuecat = data.metricSnapshots.filter(
    (metric) => metric.source === "revenuecat" && metric.date >= cutoffDate(days),
  );
  return sumByDate(groupLatestByProjectAndDate(revenuecat), "mrr");
}

// Single-project version of the trend helpers above, for the per-project dashboard. Since the
// filtered set only ever contains one projectId, groupLatestByProjectAndDate/sumByDate just
// dedupe re-synced same-day rows and return one point per date instead of summing across projects.
export function getProjectMetricTrend(
  data: AppData,
  projectId: string,
  source: SourceType,
  key: keyof MetricSnapshot,
  days = 30,
): TrendPoint[] {
  const snapshots = data.metricSnapshots.filter(
    (metric) => metric.projectId === projectId && metric.source === source && metric.date >= cutoffDate(days),
  );
  return sumByDate(groupLatestByProjectAndDate(snapshots), key);
}

function cutoffDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

// Re-running a sync the same day can push duplicate (projectId, date) snapshots since
// lib/sync.ts does not dedupe on insert; keep only the most recently created one per pair
// before aggregating, so trend charts don't double-count.
function groupLatestByProjectAndDate(snapshots: MetricSnapshot[]): MetricSnapshot[] {
  const byKey = new Map<string, MetricSnapshot>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.projectId}::${snapshot.date}`;
    const existing = byKey.get(key);
    if (!existing || snapshot.createdAt > existing.createdAt) {
      byKey.set(key, snapshot);
    }
  }
  return [...byKey.values()];
}

function sumByDate(snapshots: MetricSnapshot[], key: keyof MetricSnapshot): TrendPoint[] {
  const byDate = new Map<string, number>();
  for (const snapshot of snapshots) {
    byDate.set(snapshot.date, (byDate.get(snapshot.date) ?? 0) + Number(snapshot[key] ?? 0));
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));
}

function sum<T extends Record<string, unknown>>(items: T[], key: keyof T): number {
  return items.reduce((total, item) => total + Number(item[key] ?? 0), 0);
}

function latestByDate(snapshots: MetricSnapshot[]): MetricSnapshot | undefined {
  return snapshots.reduce<MetricSnapshot | undefined>(
    (latest, current) => (!latest || current.date > latest.date ? current : latest),
    undefined,
  );
}

function groupLatestByProject(snapshots: MetricSnapshot[]): MetricSnapshot[] {
  const byProject = new Map<string, MetricSnapshot>();
  for (const snapshot of snapshots) {
    const existing = byProject.get(snapshot.projectId);
    if (!existing || snapshot.date > existing.date) {
      byProject.set(snapshot.projectId, snapshot);
    }
  }
  return [...byProject.values()];
}

function expectedCtrForPosition(position: number) {
  if (position <= 1.5) return 28;
  if (position <= 2.5) return 17;
  if (position <= 3.5) return 11;
  if (position <= 5) return 7;
  if (position <= 8) return 4;
  if (position <= 10) return 3;
  if (position <= 15) return 1.5;
  return 0.8;
}

function computePotentialClicks(impressions: number, actualCtrPercent: number, position: number) {
  const targetCtr = expectedCtrForPosition(position);
  const ctrGap = Math.max(0, targetCtr - actualCtrPercent);
  return Math.round((impressions * ctrGap) / 100);
}

function buildCannibalizationOpportunities(data: AppData, detectedAt: string): Opportunity[] {
  const byProjectAndQuery = new Map<string, typeof data.searchQueries>();

  for (const row of data.searchQueries) {
    if (!row.page || row.impressions < 60) continue;
    const key = `${row.projectId}::${row.query.toLowerCase().trim()}`;
    const current = byProjectAndQuery.get(key) ?? [];
    current.push(row);
    byProjectAndQuery.set(key, current);
  }

  const opportunities: Opportunity[] = [];

  for (const rows of byProjectAndQuery.values()) {
    const byPage = new Map<string, (typeof rows)[number]>();

    for (const row of rows) {
      const existing = byPage.get(row.page ?? "");
      if (!existing || row.impressions > existing.impressions) {
        byPage.set(row.page ?? "", row);
      }
    }

    const pages = [...byPage.values()].sort((a, b) => b.impressions - a.impressions);
    if (pages.length < 2) continue;
    if (pages[1].impressions < pages[0].impressions * 0.25) continue;

    const totalImpressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    const totalClicks = rows.reduce((sum, row) => sum + row.clicks, 0);

    opportunities.push({
      id: createId("opp"),
      projectId: rows[0].projectId,
      type: "query_cannibalization",
      title: `Possibile cannibalizzazione: "${rows[0].query}"`,
      description: `${pages.length} URL competono sulla stessa query, per ${totalImpressions.toLocaleString("it-IT")} impression e ${totalClicks.toLocaleString("it-IT")} click. Verifica se consolidare contenuti o chiarire gli intenti.`,
      severity: totalImpressions >= 1000 ? "high" : "medium",
      score: Math.round(totalImpressions / 2),
      status: "open",
      detectedAt,
      rawJson: { query: rows[0].query, pages: pages.slice(0, 5) },
    });
  }

  return opportunities;
}
