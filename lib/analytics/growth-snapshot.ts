import type { AppData, MetricSnapshot } from "@/lib/types";
import { getAdmobRevenueRows } from "@/lib/insights";

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
  const web = recent(snapshots.filter((row) => row.source === "umami"), days);
  const ga4 = recent(snapshots.filter((row) => row.source === "ga4"), days);
  const ad = recent(getAdmobRevenueRows(data, projectId), days);
  const playInstalls = recent(data.playInstallStats.filter((row) => row.projectId === projectId), days);
  const ios = recent(data.ascAnalyticsMetrics.filter((row) => row.projectId === projectId), days);
  const vitals = latest(data.playVitalsMetrics.filter((row) => row.projectId === projectId));
  const subscription = latest(snapshots.filter((row) => row.source === "revenuecat"));
  const searches = search.rows as MetricSnapshot[];
  const clicks = total(searches, "clicks");
  const impressions = total(searches, "impressions");
  const avgPosition = impressions && impressions > 0
    ? searches.reduce((sum, row) => sum + (row.avgPosition ?? 0) * (row.impressions ?? 0), 0) / impressions
    : null;
  const adCurrencies = [...new Set(ad.rows.map((row) => row.currency ?? "unknown"))];
  const canSumAdRevenue = adCurrencies.length === 1 && adCurrencies[0] !== "unknown";
  const lastRunBySource = new Map<string, (typeof data.connectorRuns)[number]>();
  for (const run of data.connectorRuns.filter((row) => row.projectId === projectId)) {
    const previous = lastRunBySource.get(run.source);
    if (!previous || run.finishedAt > previous.finishedAt) lastRunBySource.set(run.source, run);
  }

  const topOpportunities = data.opportunities
    .filter((row) => row.projectId === projectId && row.status === "open")
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
      ctr: impressions && impressions > 0 && clicks !== null ? clicks / impressions : null,
      avgPosition,
    },
    web: {
      latestDataDate: web.latestDataDate, observedDays: web.observedDays,
      visitors: total(web.rows, "visitors"), pageviews: total(web.rows, "pageviews"),
    },
    ga4: {
      latestDataDate: ga4.latestDataDate, observedDays: ga4.observedDays,
      activeUsers: total(ga4.rows, "visitors"), pageviews: total(ga4.rows, "pageviews"),
      sessions: ga4.rows.reduce<number | null>((sum, row) => {
        const v = (row.rawJson as { sessions?: number } | undefined)?.sessions;
        return typeof v === "number" ? (sum ?? 0) + v : sum;
      }, null),
      note: "GA4 active users is not equivalent to Umami visitors. Do not add the two sources.",
    },
    advertising: {
      latestDataDate: ad.latestDataDate, observedDays: ad.observedDays,
      estimatedRevenue: canSumAdRevenue ? total(ad.rows, "revenue") : null,
      currency: canSumAdRevenue ? adCurrencies[0] : null,
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
      deviceInstalls: total(playInstalls.rows, "installs"),
      deviceUninstalls: total(playInstalls.rows, "uninstalls"),
      activeDeviceInstalls: latest(playInstalls.rows)?.activeDeviceInstalls ?? null,
      latestVitals: vitals ? { date: vitals.date, crashRate: vitals.crashRate ?? null, anrRate: vitals.anrRate ?? null } : null,
    },
    ios: {
      latestDataDate: ios.latestDataDate, observedDays: ios.observedDays,
      downloads: total(ios.rows, "downloads"),
      retentionDay1: latest(ios.rows)?.retentionDay1 ?? null,
    },
    topOpportunities,
    latestSyncs: [...lastRunBySource.values()].map((run) => ({
      source: run.source, status: run.status, finishedAt: run.finishedAt,
    })),
  };
}
