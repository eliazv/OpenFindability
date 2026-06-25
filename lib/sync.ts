import { daysAgo, nowIso } from "@/lib/dates";
import { buildOpportunities } from "@/lib/insights";
import { createId } from "@/lib/id";
import { syncGscProject } from "@/lib/connectors/gsc";
import { syncUmamiProject } from "@/lib/connectors/umami";
import { syncPlayConsoleProject } from "@/lib/connectors/play-console";
import { syncAsoProject } from "@/lib/connectors/aso";
import { syncRevenueCatProject } from "@/lib/connectors/revenuecat";
import { syncAdmobProject } from "@/lib/connectors/admob";
import { upsertAsoCacheRows } from "@/lib/aso-cache";
import { readData, writeData } from "@/lib/store";
import type { ConnectorRun, SourceType, SyncOptions, SyncResult } from "@/lib/types";

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
        data.metricSnapshots.push(...synced.snapshots);
        data.searchQueries.push(...synced.queries);
        data.pageMetrics.push(...synced.pages);
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
        data.metricSnapshots.push(...synced.snapshots);
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
        data.metricSnapshots.push(...synced.snapshots);
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
        data.metricSnapshots.push(...synced.snapshots);
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
        const synced = await syncAdmobProject(project, daysAgo(1));
        data.metricSnapshots.push(...synced.snapshots);
        results.push(synced.result);
        data.connectorRuns.push(toRun("admob", project.id, startedAt, synced.result));
      } catch (error) {
        const result = failed("admob", project.id, error);
        results.push(result);
        data.connectorRuns.push(toRun("admob", project.id, startedAt, result));
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
