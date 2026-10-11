import { db, getSqliteHandle, type AppDb } from "@/lib/db/client";
import {
  admobMediationMetrics as admobMediationMetricsTable,
  appKeywords as appKeywordsTable,
  appReviews as appReviewsTable,
  ascAnalyticsMetrics as ascAnalyticsMetricsTable,
  ascExperiments as ascExperimentsTable,
  ascExperimentTreatments as ascExperimentTreatmentsTable,
  ascMetadataSnapshots as ascMetadataSnapshotsTable,
  asoAppRankSnapshots as asoAppRankSnapshotsTable,
  asoKeywordSnapshots as asoKeywordSnapshotsTable,
  connectorRuns as connectorRunsTable,
  gscDimensionBreakdowns as gscDimensionBreakdownsTable,
  gscIndexInspections as gscIndexInspectionsTable,
  gscSitemaps as gscSitemapsTable,
  metricSnapshots as metricSnapshotsTable,
  opportunities as opportunitiesTable,
  pageMetrics as pageMetricsTable,
  playInstallStats as playInstallStatsTable,
  playVitalsMetrics as playVitalsMetricsTable,
  projects as projectsTable,
  searchQueries as searchQueriesTable,
} from "@/lib/db/schema";
import type {
  AdmobMediationMetric,
  AppData,
  AppKeywordMetric,
  AppReview,
  AscAnalyticsMetric,
  AscExperiment,
  AscExperimentTreatment,
  AscMetadataSnapshot,
  AsoAppRankSnapshot,
  AsoKeywordSnapshot,
  ConnectorRun,
  GscDimensionBreakdown,
  GscIndexInspection,
  GscSitemap,
  MetricSnapshot,
  Opportunity,
  PageMetric,
  PlayInstallStat,
  PlayVitalsMetric,
  Project,
  SearchQueryMetric,
} from "@/lib/types";

export { getDbFilePath as getDataFilePath } from "@/lib/db/client";

const INSERT_CHUNK_SIZE = 50;

// Revision is attached to the exact snapshot returned by readData().
const snapshotRevisions = new WeakMap<AppData, number>();

export class StaleStoreSnapshotError extends Error {
  constructor(expected: number, actual: number) {
    super(`OpenFindability data changed since it was read (revision ${expected} -> ${actual}). Retry the operation; no data was overwritten.`);
    this.name = "StaleStoreSnapshotError";
  }
}

function storeRevision(database: AppDb): number {
  const row = getSqliteHandle(database)
    .prepare("SELECT revision FROM _openfindability_store_revision WHERE id = 1")
    .get() as { revision: number };
  return row.revision;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// Drizzle always returns SQL NULL as JS null; AppData's optional fields use undefined.
function denull<T extends Record<string, unknown>>(row: T): T {
  const out = {} as T;
  for (const key of Object.keys(row) as (keyof T)[]) {
    const value = row[key];
    out[key] = (value === null ? undefined : value) as T[keyof T];
  }
  return out;
}

// Parameterized by db instance so callers with their own connection (e.g. mcp/server.ts,
// which runs with an arbitrary cwd from other repos) can reuse the same read/write logic.
export function readDataWith(database: AppDb): AppData {
  const native = getSqliteHandle(database);
  // Read all tables and their revision in a consistent SQLite transaction.
  return native.transaction(() => {
  const revision = storeRevision(database);
  const projects = database.select().from(projectsTable).all().map(denull) as Project[];
  const metricSnapshots = database.select().from(metricSnapshotsTable).all().map(denull) as MetricSnapshot[];
  const searchQueries = database.select().from(searchQueriesTable).all().map(denull) as SearchQueryMetric[];
  const pageMetrics = database.select().from(pageMetricsTable).all().map(denull) as PageMetric[];
  const opportunities = database.select().from(opportunitiesTable).all().map(denull) as Opportunity[];
  const connectorRuns = database.select().from(connectorRunsTable).all().map(denull) as ConnectorRun[];

  const appReviews = database
    .select()
    .from(appReviewsTable)
    .all()
    .map((row) => {
      const { reviewText, ...rest } = denull(row);
      return { ...rest, text: reviewText } as AppReview;
    });

  // appRank is nullable (not just optional) for these two tables, so keep the literal null from the row.
  const appKeywords = database
    .select()
    .from(appKeywordsTable)
    .all()
    .map((row) => ({ ...denull(row), appRank: row.appRank })) as AppKeywordMetric[];

  const asoKeywordSnapshots = database.select().from(asoKeywordSnapshotsTable).all().map(denull) as AsoKeywordSnapshot[];

  const asoAppRankSnapshots = database
    .select()
    .from(asoAppRankSnapshotsTable)
    .all()
    .map((row) => ({ ...denull(row), appRank: row.appRank })) as AsoAppRankSnapshot[];

  const gscDimensionBreakdowns = database
    .select()
    .from(gscDimensionBreakdownsTable)
    .all()
    .map(denull) as GscDimensionBreakdown[];

  const gscSitemaps = database.select().from(gscSitemapsTable).all().map(denull) as GscSitemap[];

  const gscIndexInspections = database
    .select()
    .from(gscIndexInspectionsTable)
    .all()
    .map(denull) as GscIndexInspection[];

  const admobMediationMetrics = database
    .select()
    .from(admobMediationMetricsTable)
    .all()
    .map(denull) as AdmobMediationMetric[];

  const ascMetadataSnapshots = database
    .select()
    .from(ascMetadataSnapshotsTable)
    .all()
    .map(denull) as AscMetadataSnapshot[];

  const ascExperiments = database.select().from(ascExperimentsTable).all().map(denull) as AscExperiment[];

  const ascExperimentTreatments = database
    .select()
    .from(ascExperimentTreatmentsTable)
    .all()
    .map(denull) as AscExperimentTreatment[];

  const playVitalsMetrics = database.select().from(playVitalsMetricsTable).all().map(denull) as PlayVitalsMetric[];

  const playInstallStats = database.select().from(playInstallStatsTable).all().map(denull) as PlayInstallStat[];

  const ascAnalyticsMetrics = database
    .select()
    .from(ascAnalyticsMetricsTable)
    .all()
    .map(denull) as AscAnalyticsMetric[];

  const snapshot: AppData = {
    projects,
    metricSnapshots,
    searchQueries,
    pageMetrics,
    opportunities,
    connectorRuns,
    appReviews,
    appKeywords,
    asoKeywordSnapshots,
    asoAppRankSnapshots,
    gscDimensionBreakdowns,
    gscSitemaps,
    gscIndexInspections,
    admobMediationMetrics,
    ascMetadataSnapshots,
    ascExperiments,
    ascExperimentTreatments,
    playVitalsMetrics,
    playInstallStats,
    ascAnalyticsMetrics,
  };
  snapshotRevisions.set(snapshot, revision);
  return snapshot;
  })();
}

export function writeDataWith(database: AppDb, data: AppData): void {
  const expectedRevision = snapshotRevisions.get(data);
  if (expectedRevision === undefined) {
    throw new Error("Untracked AppData cannot overwrite SQLite. Read a fresh snapshot first or use updateData for an explicit replacement.");
  }
  const revision = database.transaction((tx) => {
    const actualRevision = storeRevision(database);
    if (expectedRevision !== actualRevision) {
      throw new StaleStoreSnapshotError(expectedRevision, actualRevision);
    }
    tx.delete(searchQueriesTable).run();
    tx.delete(pageMetricsTable).run();
    tx.delete(opportunitiesTable).run();
    tx.delete(connectorRunsTable).run();
    tx.delete(appReviewsTable).run();
    tx.delete(appKeywordsTable).run();
    tx.delete(asoAppRankSnapshotsTable).run();
    tx.delete(gscDimensionBreakdownsTable).run();
    tx.delete(gscSitemapsTable).run();
    tx.delete(gscIndexInspectionsTable).run();
    tx.delete(admobMediationMetricsTable).run();
    tx.delete(ascMetadataSnapshotsTable).run();
    tx.delete(ascExperimentTreatmentsTable).run();
    tx.delete(ascExperimentsTable).run();
    tx.delete(playVitalsMetricsTable).run();
    tx.delete(playInstallStatsTable).run();
    tx.delete(ascAnalyticsMetricsTable).run();
    tx.delete(metricSnapshotsTable).run();
    tx.delete(projectsTable).run();
    tx.delete(asoKeywordSnapshotsTable).run();

    for (const batch of chunk(data.projects, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(projectsTable).values(batch).run();
    }
    for (const batch of chunk(data.metricSnapshots, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(metricSnapshotsTable).values(batch).run();
    }
    for (const batch of chunk(data.searchQueries, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(searchQueriesTable).values(batch).run();
    }
    for (const batch of chunk(data.pageMetrics, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(pageMetricsTable).values(batch).run();
    }
    for (const batch of chunk(data.opportunities, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(opportunitiesTable).values(batch).run();
    }
    for (const batch of chunk(data.connectorRuns, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(connectorRunsTable).values(batch).run();
    }
    for (const batch of chunk(data.appReviews, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) {
        tx.insert(appReviewsTable)
          .values(batch.map(({ text, ...rest }) => ({ ...rest, reviewText: text })))
          .run();
      }
    }
    for (const batch of chunk(data.appKeywords, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(appKeywordsTable).values(batch).run();
    }
    for (const batch of chunk(data.asoKeywordSnapshots, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(asoKeywordSnapshotsTable).values(batch).run();
    }
    for (const batch of chunk(data.asoAppRankSnapshots, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(asoAppRankSnapshotsTable).values(batch).run();
    }
    for (const batch of chunk(data.gscDimensionBreakdowns, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(gscDimensionBreakdownsTable).values(batch).run();
    }
    for (const batch of chunk(data.gscSitemaps, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(gscSitemapsTable).values(batch).run();
    }
    for (const batch of chunk(data.gscIndexInspections, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(gscIndexInspectionsTable).values(batch).run();
    }
    for (const batch of chunk(data.admobMediationMetrics, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(admobMediationMetricsTable).values(batch).run();
    }
    for (const batch of chunk(data.ascMetadataSnapshots, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(ascMetadataSnapshotsTable).values(batch).run();
    }
    for (const batch of chunk(data.ascExperiments, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(ascExperimentsTable).values(batch).run();
    }
    for (const batch of chunk(data.ascExperimentTreatments, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(ascExperimentTreatmentsTable).values(batch).run();
    }
    for (const batch of chunk(data.playVitalsMetrics, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(playVitalsMetricsTable).values(batch).run();
    }
    for (const batch of chunk(data.playInstallStats, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(playInstallStatsTable).values(batch).run();
    }
    for (const batch of chunk(data.ascAnalyticsMetrics, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(ascAnalyticsMetricsTable).values(batch).run();
    }
    getSqliteHandle(database)
      .prepare("UPDATE _openfindability_store_revision SET revision = revision + 1 WHERE id = 1")
      .run();
    return actualRevision + 1;
  });
  snapshotRevisions.set(data, revision);
}

export async function readData(): Promise<AppData> {
  return readDataWith(db);
}

export async function writeData(data: AppData): Promise<void> {
  writeDataWith(db, data);
}

export async function updateData(mutator: (data: AppData) => AppData | void): Promise<AppData> {
  // Retry the synchronous mutation against a fresh snapshot after a conflict.
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = await readData();
    const next = mutator(data) ?? data;
    if (next !== data) snapshotRevisions.set(next, snapshotRevisions.get(data)!);
    try {
      await writeData(next);
      return next;
    } catch (error) {
      if (!(error instanceof StaleStoreSnapshotError) || attempt === 2) throw error;
    }
  }
  throw new Error("Unreachable store retry state.");
}
