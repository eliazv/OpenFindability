import { daysAgo, nowIso } from "@/lib/dates";
import { buildOpportunities } from "@/lib/insights";
import { isDailyGscDetail } from "@/lib/gsc-detail";
import { createId } from "@/lib/id";
import { syncGscProject } from "@/lib/connectors/gsc";
import { syncGa4Project } from "@/lib/connectors/ga4";
import { syncUmamiProject } from "@/lib/connectors/umami";
import { syncBingProject } from "@/lib/connectors/bing";
import { syncCloudflareProject } from "@/lib/connectors/cloudflare-ai";
import { syncClarityProject } from "@/lib/connectors/clarity";
import { syncPlayConsoleProject } from "@/lib/connectors/play-console";
import { syncAsoProject } from "@/lib/connectors/aso";
import { syncRevenueCatProject } from "@/lib/connectors/revenuecat";
import { syncAdmobProject } from "@/lib/connectors/admob";
import { syncAdsenseProject } from "@/lib/connectors/adsense";
import { syncPlayVitalsProject } from "@/lib/connectors/play-vitals";
import { syncPlayInstallStatsProject } from "@/lib/connectors/play-gcs-stats";
import { syncAscAnalyticsProject } from "@/lib/connectors/appstoreconnect-analytics";
import { upsertAsoCacheRows } from "@/lib/aso-cache";
import { readData, writeData } from "@/lib/store";
import { reconcileGscProjectLinks } from "@/lib/gsc-project-links";
import type {
  AdmobMediationMetric,
  AscAnalyticsMetric,
  ConnectorRun,
  GscDimensionBreakdown,
  GscSitemap,
  MetricSnapshot,
  PageMetric,
  PlayInstallStat,
  PlayVitalsMetric,
  SearchQueryMetric,
  SourceType,
  SyncOptions,
  SyncResult,
} from "@/lib/types";

// Re-running a sync the same day must not pile up duplicate rows for the same
// (project, date[, source]) key, since reports/insights sum these by date.
function upsertByKey<T>(existing: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  if (incoming.length === 0) return existing;
  const keys = new Set(incoming.map(keyOf));
  return [...existing.filter((item) => !keys.has(keyOf(item))), ...incoming];
}

function upsertSnapshots(existing: MetricSnapshot[], incoming: MetricSnapshot[]): MetricSnapshot[] {
  return upsertByKey(existing, incoming, (snapshot) => `${snapshot.projectId}::${snapshot.source}::${snapshot.date}`);
}

function upsertQueries(existing: SearchQueryMetric[], incoming: SearchQueryMetric[]): SearchQueryMetric[] {
  return upsertByKey(
    existing,
    incoming,
    (row) => `${row.projectId}::${row.date}::${row.query}::${row.page ?? ""}`,
  );
}

function upsertPages(existing: PageMetric[], incoming: PageMetric[]): PageMetric[] {
  return upsertByKey(existing, incoming, (row) => `${row.projectId}::${row.date}::${row.page}`);
}

function upsertBreakdowns(existing: GscDimensionBreakdown[], incoming: GscDimensionBreakdown[]): GscDimensionBreakdown[] {
  return upsertByKey(
    existing,
    incoming,
    (row) => `${row.projectId}::${row.rangeStart}::${row.rangeEnd}::${row.dimension}::${row.key}`,
  );
}

function upsertSitemaps(existing: GscSitemap[], incoming: GscSitemap[]): GscSitemap[] {
  return upsertByKey(existing, incoming, (row) => `${row.projectId}::${row.path}`);
}

function upsertMediationMetrics(
  existing: AdmobMediationMetric[],
  incoming: AdmobMediationMetric[],
): AdmobMediationMetric[] {
  return upsertByKey(
    existing,
    incoming,
    (row) => `${row.projectId}::${row.date}::${row.adSourceId ?? row.adSourceName}::${row.format ?? ""}`,
  );
}

function upsertPlayVitalsMetrics(existing: PlayVitalsMetric[], incoming: PlayVitalsMetric[]): PlayVitalsMetric[] {
  return upsertByKey(existing, incoming, (row) => `${row.projectId}::${row.date}`);
}

function upsertPlayInstallStats(existing: PlayInstallStat[], incoming: PlayInstallStat[]): PlayInstallStat[] {
  return upsertByKey(existing, incoming, (row) => `${row.projectId}::${row.date}`);
}

function upsertAscAnalyticsMetrics(existing: AscAnalyticsMetric[], incoming: AscAnalyticsMetric[]): AscAnalyticsMetric[] {
  return upsertByKey(existing, incoming, (row) => `${row.projectId}::${row.date}`);
}

export async function syncProjects(options: SyncOptions = {}): Promise<SyncResult[]> {
  const source = options.source;
  const backfillDays = options.backfillDays ?? 30;
  const data = await readData();
  reconcileGscProjectLinks(data);
  const results: SyncResult[] = [];
  const startedAt = nowIso();

  for (const project of data.projects) {
    for (const provider of ["bing_webmaster", "cloudflare_ai", "clarity"] as const) {
      if (source && source !== provider) continue;
      try {
        const synced = await (provider === "bing_webmaster" ? syncBingProject(project, daysAgo(backfillDays), daysAgo(1))
          : provider === "cloudflare_ai" ? syncCloudflareProject(project) : syncClarityProject(project));
        data.metricSnapshots = upsertSnapshots(data.metricSnapshots, synced.snapshots);
        if ("replaceWindow" in synced && synced.replaceWindow) {
          const window = synced.replaceWindow;
          data.seoGeoObservations = (data.seoGeoObservations ?? []).filter(row =>
            row.projectId !== project.id || row.source !== provider || row.kind !== window.kind || row.windowStart < window.start || row.windowEnd > window.end);
        }
        data.seoGeoObservations = upsertByKey(data.seoGeoObservations ?? [], synced.observations, row => row.id);
        results.push(synced.result);
        data.connectorRuns.push(toRun(provider, project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed(provider, project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun(provider, project.id, startedAt, result));
      }
    }
    if (!source || source === "gsc") {
      try {
        const synced = await syncGscProject(project, daysAgo(backfillDays), daysAgo(2));
        data.metricSnapshots = upsertSnapshots(data.metricSnapshots, synced.snapshots);
        // A successful refetch is an authoritative snapshot of each covered day.
        // Remove previous *daily* rows for these days first, including keywords
        // Google no longer returns. Preserve all legacy multi-day aggregates for
        // audit/migration (they lack the v2 daily grain marker).
        const coveredDays = new Set(synced.snapshots.map((snapshot) => snapshot.date));
        const keepUncovered = (row: SearchQueryMetric | PageMetric) =>
          row.projectId !== project.id || !coveredDays.has(row.date) || !isDailyGscDetail(row);
        data.searchQueries = upsertQueries(data.searchQueries.filter(keepUncovered), synced.queries);
        data.pageMetrics = upsertPages(data.pageMetrics.filter(keepUncovered), synced.pages);
        data.gscDimensionBreakdowns = upsertBreakdowns(data.gscDimensionBreakdowns, synced.breakdowns);
        data.gscSitemaps = upsertSitemaps(data.gscSitemaps, synced.sitemaps);
        results.push(synced.result);
        data.connectorRuns.push(toRun("gsc", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("gsc", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("gsc", project.id, startedAt, result));
      }
    }

    if (!source || source === "ga4") {
      try {
        const synced = await syncGa4Project(project, daysAgo(backfillDays), daysAgo(2));
        data.metricSnapshots = upsertSnapshots(data.metricSnapshots, synced.snapshots);
        results.push(synced.result);
        data.connectorRuns.push(toRun("ga4", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("ga4", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("ga4", project.id, startedAt, result));
      }
    }

    if (!source || source === "umami") {
      try {
        const synced = await syncUmamiProject(project, daysAgo(backfillDays), daysAgo(1));
        data.metricSnapshots = upsertSnapshots(data.metricSnapshots, synced.snapshots);
        results.push(synced.result);
        data.connectorRuns.push(toRun("umami", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("umami", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("umami", project.id, startedAt, result));
      }
    }

    // ASO is opt-in only: it is rate-limited (2s/call) and cached per day upstream,
    // so it must not run as part of a general `pnpm run sync`.
    if (source === "aso") {
      try {
        const synced = await syncAsoProject(project);
        data.appKeywords.push(...synced.keywords);
        upsertAsoCacheRows(data, synced.keywords, {
          projectId: project.id,
          appId: project.respectAsoAppId ?? project.appStoreTrackId,
        });
        results.push(synced.result);
        data.connectorRuns.push(toRun("aso", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("aso", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("aso", project.id, startedAt, result));
      }
    }

    if (!source || source === "play_console") {
      try {
        const existingReviewIds = new Set(
          data.appReviews.filter((r) => r.projectId === project.id).map((r) => r.reviewId),
        );
        const synced = await syncPlayConsoleProject(project, daysAgo(backfillDays));
        const newReviews = synced.reviews.filter((r) => !existingReviewIds.has(r.reviewId));
        data.appReviews.push(...newReviews);
        data.metricSnapshots = upsertSnapshots(data.metricSnapshots, synced.snapshots);
        results.push(synced.result);
        data.connectorRuns.push(toRun("play_console", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("play_console", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("play_console", project.id, startedAt, result));
      }
    }

    if (!source || source === "revenuecat") {
      try {
        const synced = await syncRevenueCatProject(project, daysAgo(0));
        data.metricSnapshots = upsertSnapshots(data.metricSnapshots, synced.snapshots);
        results.push(synced.result);
        data.connectorRuns.push(toRun("revenuecat", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("revenuecat", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("revenuecat", project.id, startedAt, result));
      }
    }

    if (!source || source === "admob") {
      try {
        const synced = await syncAdmobProject(project, daysAgo(backfillDays), daysAgo(1));
        data.metricSnapshots = upsertSnapshots(data.metricSnapshots, synced.snapshots);
        data.admobMediationMetrics = upsertMediationMetrics(data.admobMediationMetrics, synced.mediationMetrics);
        results.push(synced.result);
        data.connectorRuns.push(toRun("admob", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("admob", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("admob", project.id, startedAt, result));
      }
    }

    if (!source || source === "adsense") {
      try {
        const synced = await syncAdsenseProject(project, daysAgo(backfillDays), daysAgo(1));
        data.metricSnapshots = upsertSnapshots(data.metricSnapshots, synced.snapshots);
        results.push(synced.result);
        data.connectorRuns.push(toRun("adsense", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("adsense", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("adsense", project.id, startedAt, result));
      }
    }

    if (!source || source === "play_vitals") {
      try {
        // Play Developer Reporting API vitals data lags ~5 days behind real-time
        // (observed: "end_date should be at most the current freshness" errors with daysAgo(1)/(2)).
        const synced = await syncPlayVitalsProject(project, daysAgo(backfillDays), daysAgo(5));
        data.playVitalsMetrics = upsertPlayVitalsMetrics(data.playVitalsMetrics, synced.metrics);
        results.push(synced.result);
        data.connectorRuns.push(toRun("play_vitals", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("play_vitals", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("play_vitals", project.id, startedAt, result));
      }
    }

    if (!source || source === "play_stats") {
      try {
        const synced = await syncPlayInstallStatsProject(project, daysAgo(backfillDays), daysAgo(1));
        data.playInstallStats = upsertPlayInstallStats(data.playInstallStats, synced.stats);
        results.push(synced.result);
        data.connectorRuns.push(toRun("play_stats", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("play_stats", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("play_stats", project.id, startedAt, result));
      }
    }

    if (!source || source === "asc_analytics") {
      try {
        const synced = await syncAscAnalyticsProject(project, daysAgo(backfillDays), daysAgo(1));
        data.ascAnalyticsMetrics = upsertAscAnalyticsMetrics(data.ascAnalyticsMetrics, synced.metrics);
        results.push(synced.result);
        data.connectorRuns.push(toRun("asc_analytics", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("asc_analytics", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("asc_analytics", project.id, startedAt, result));
      }
    }
  }

  // Recomputing opportunities must not erase a user's ignored/done decisions.
  // Match on a stable semantic identity rather than the generated random ID.
  const prior = new Map(data.opportunities.map((item) => [
    `${item.projectId}\u0000${item.type}\u0000${item.title}`,
    item,
  ] as const));
  data.opportunities = buildOpportunities(data).map((item) => {
    const previous = prior.get(`${item.projectId}\u0000${item.type}\u0000${item.title}`);
    return previous
      ? { ...item, id: previous.id, status: previous.status, detectedAt: previous.detectedAt }
      : item;
  });
  await writeData(data);
  return results;
}

function failed(source: SourceType, projectId: string, error: unknown): SyncResult {
  return {
    source,
    projectId,
    status: "failed",
    message: error instanceof Error ? error.message : "Unknown sync error.",
    inserted: { snapshots: 0, queries: 0, pages: 0 },
  };
}

function toRun(source: SourceType, projectId: string, startedAt: string, result: SyncResult): ConnectorRun {
  return {
    id: createId("run"),
    source,
    projectId,
    status: result.status,
    startedAt,
    finishedAt: nowIso(),
    errorMessage: result.status === "failed" ? result.message : undefined,
    stats: result.inserted,
  };
}
