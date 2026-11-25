import type { AppData } from "@/lib/types";
import { getAdmobRevenueRows } from "@/lib/insights";
import { METRICS, projectMetric, openOpportunities, type MetricSpec } from "@/lib/dashboard/read-model";

type Dated = { date: string };
function recent<T extends Dated>(rows: T[], days: number) {
  const end = rows.reduce((max, row) => row.date > max ? row.date : max, "");
  if (!end) return { rows: [] as T[], latestDataDate: null as string | null, observedDays: 0 };
  const start = new Date(end + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - days + 1);
  const cutoff = start.toISOString().slice(0, 10);
  const chosen = rows.filter((row) => row.date >= cutoff && row.date <= end);
  return { rows: chosen, latestDataDate: end, observedDays: new Set(chosen.map((row) => row.date)).size };
}
function total<T>(rows: T[], key: keyof T): number | null {
  const known = rows.filter((row) => typeof row[key] === "number");
  if (!known.length) return null;
  return known.reduce((sum, row) => sum + (row[key] as number), 0);
}
function latest<T extends Dated>(rows: T[]): T | undefined {
  return rows.reduce<T | undefined>((acc, row) => !acc || row.date > acc.date ? row : acc, undefined);
}

export function getGrowthSnapshot(data: AppData, projectId: string, days: 7 | 28 | 90 = 28) {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Unknown OpenFindability project.");
  const snapshots = data.metricSnapshots.filter((row) => row.projectId === projectId);
  const search = recent(snapshots.filter((row) => row.source === "gsc"), days);
  const web = recent(snapshots.filter((row) => row.source === "umami" && row.date >= "2026-08-08"), days);
  const ga4 = recent(snapshots.filter((row) => row.source === "ga4"), days);
  const ad = recent(getAdmobRevenueRows(data, projectId), days);
  const playInstalls = recent(data.playInstallStats.filter((row) => row.projectId === projectId), days);
  const ios = recent(data.ascAnalyticsMetrics.filter((row) => row.projectId === projectId && row.date >= "2025-09-21"), days);
  const vitals = latest(data.playVitalsMetrics.filter((row) => row.projectId === projectId));
  const subscription = latest(snapshots.filter((row) => row.source === "revenuecat"));
  const value = (spec: MetricSpec) => projectMetric(data, projectId, spec, days).result.value;
  const clicks = value(METRICS.clicks);
  const impressions = value(METRICS.impressions);
  const avgPosition = value(METRICS.position);
  const ctr = value(METRICS.ctr);
  const ads = projectMetric(data, projectId, METRICS.ads, days).result;
  const adCurrencies = [...new Set(ad.rows.map((row) => row.currency ?? "unknown"))];
  const lastRunBySource = new Map<string, (typeof data.connectorRuns)[number]>();
  for (const run of data.connectorRuns.filter((row) => row.projectId === projectId)) {
    const previous = lastRunBySource.get(run.source);
    if (!previous || run.finishedAt > previous.finishedAt) lastRunBySource.set(run.source, run);
  }

  const topOpportunities = openOpportunities(data, projectId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => ({ type: row.type, title: row.title, score: row.score, severity: row.severity }));

  return {
    project: { slug: project.slug, name: project.name, type: project.type },
    windowDays: days,
    note: "Each source window ends at its latest available date; sources may have different freshness. Missing values are null, not zero.",
    seo: {
      latestDataDate: search.latestDataDate, observedDays: search.observedDays,
      clicks, impressions,
      ctr: ctr === null ? null : ctr / 100,
      avgPosition,
    },
    web: {
      latestDataDate: web.latestDataDate, observedDays: web.observedDays,
      visitors: value(METRICS.visitors), pageviews: value(METRICS.umamiViews),
    },
    ga4: {
      latestDataDate: ga4.latestDataDate, observedDays: ga4.observedDays,
      summedDailyActiveUsers: value(METRICS.gaUsers), pageviews: value(METRICS.gaViews),
      sessions: ga4.rows.reduce<number | null>((sum, row) => {
        const v = row.sessions ?? (row.rawJson as { sessions?: number } | undefined)?.sessions;
        return typeof v === "number" ? (sum ?? 0) + v : sum;
      }, null),
      note: "Sum of daily active users is user-days, NOT distinct active users across the whole window; do not combine it with Umami.",
    },
    advertising: {
      latestDataDate: ad.latestDataDate, observedDays: ad.observedDays,
      estimatedRevenue: ads.value,
      currency: ads.currency ?? null,
      warning: adCurrencies.length > 1 ? "Multiple currencies: do not sum without FX conversion" : adCurrencies.includes("unknown") ? "Currency unavailable: revenue cannot be safely summed" : undefined,
    },
    subscriptions: subscription ? {
      asOf: subscription.date, mrr: subscription.mrr ?? null,
      activeSubscribers: subscription.activeSubscribers ?? null,
      rolling28dRevenue: subscription.revenue ?? null,
      currency: subscription.currency ?? null,
      note: "RevenueCat is a rolling-28-day snapshot; never sum daily snapshots",
    } : null,
    android: {
      latestDataDate: playInstalls.latestDataDate, observedDays: playInstalls.observedDays,
      deviceInstalls: value(METRICS.deviceInstalls),
      deviceUninstalls: value(METRICS.deviceUninstalls),
      activeDeviceInstalls: latest(playInstalls.rows)?.activeDeviceInstalls ?? null,
      latestVitals: vitals ? { date: vitals.date, crashRate: vitals.crashRate ?? null, anrRate: vitals.anrRate ?? null } : null,
    },
    ios: {
      latestDataDate: ios.latestDataDate, observedDays: ios.observedDays,
      downloads: value(METRICS.downloads),
      retentionDay1: latest(ios.rows)?.retentionDay1 ?? null,
    },
    topOpportunities,
    latestSyncs: [...lastRunBySource.values()].map((run) => ({
      source: run.source, status: run.status, finishedAt: run.finishedAt,
    })),
  };
}
