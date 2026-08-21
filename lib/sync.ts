import { daysAgo, nowIso } from "@/lib/dates";
import { buildOpportunities } from "@/lib/insights";
import { createId } from "@/lib/id";
import { syncGscProject } from "@/lib/connectors/gsc";
import { syncUmamiProject } from "@/lib/connectors/umami";
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
  const results: SyncResult[] = [];
  const startedAt = nowIso();

  for (const project of data.projects) {
    if (!source || source === "gsc") {
      try {
        const synced = await syncGscProject(project, daysAgo(backfillDays), daysAgo(2));
        data.metricSnapshots = upsertSnapshots(data.metricSnapshots, synced.snapshots);
        data.searchQueries = upsertQueries(data.searchQueries, synced.queries);
        data.pageMetrics = upsertPages(data.pageMetrics, synced.pages);
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

    if (!source || source === "umami") {
      try {
        const synced = await syncUmamiProject(project, daysAgo(1));
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
        const synced = await syncPlayVitalsProject(project, daysAgo(backfillDays), daysAgo(1));
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

  data.opportunities = buildOpportunities(data);
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
