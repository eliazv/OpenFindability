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
  seoGeoObservations as seoGeoObservationsTable,
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
// Stable serialized baselines let the legacy store skip untouched tables
// instead of deleting/reinserting every table on every sync or metadata edit.
const snapshotTableDigests = new WeakMap<AppData, Map<string, string>>();

function tableDigests(data: AppData): Map<string, string> {
  return new Map(Object.entries(data).map(([name, rows]) => [name, JSON.stringify(rows)]));
}

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
    seoGeoObservations: database.select().from(seoGeoObservationsTable).all() as NonNullable<AppData["seoGeoObservations"]>,
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
  snapshotTableDigests.set(snapshot, tableDigests(snapshot));
  return snapshot;
  })();
}

type GscDetail = SearchQueryMetric | PageMetric;

function writeGscRowDelta(
  database: AppDb,
  name: "search_queries" | "page_metrics",
  before: GscDetail[],
  after: GscDetail[],
): void {
  // Stable ID-based diff: a refetched GSC day gets new IDs, so obsolete rows
  // must be deleted before replacement inserts to respect natural-key indexes.
  // All statements run inside writeDataWith's transaction.
  const sqlite = getSqliteHandle(database);
  const previous = new Map(before.map((row) => [row.id, row]));
  const nextIds = new Set(after.map((row) => row.id));
  const columns = name === "search_queries"
    ? ["project_id", "date", "query", "page", "clicks", "impressions", "ctr", "avg_position", "raw_json"]
    : ["project_id", "date", "page", "clicks", "impressions", "ctr", "avg_position", "raw_json"];
  const encode = (row: GscDetail): Array<string | number | null> => name === "search_queries"
    ? [
        row.projectId, row.date, (row as SearchQueryMetric).query, (row as SearchQueryMetric).page ?? null,
        row.clicks, row.impressions, row.ctr, row.avgPosition,
        row.rawJson === undefined ? null : JSON.stringify(row.rawJson),
      ]
    : [
        row.projectId, row.date, (row as PageMetric).page,
        row.clicks, row.impressions, row.ctr, row.avgPosition,
        row.rawJson === undefined ? null : JSON.stringify(row.rawJson),
      ];
  const remove = sqlite.prepare(`DELETE FROM ${name} WHERE id = ?`);
  const insert = sqlite.prepare(`INSERT INTO ${name} (id, ${columns.join(", ")})
    VALUES (${["?", ...columns.map(() => "?")].join(", ")})`);
  const update = sqlite.prepare(`UPDATE ${name} SET ${columns.map((c) => c + " = ?").join(", ")} WHERE id = ?`);

  for (const row of before) {
    if (!nextIds.has(row.id)) remove.run(row.id);
  }
  for (const row of after) {
    const old = previous.get(row.id);
    if (old === undefined) insert.run(row.id, ...encode(row));
    else if (JSON.stringify(old) !== JSON.stringify(row)) update.run(...encode(row), row.id);
  }
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
    const baseline = snapshotTableDigests.get(data);
    const changed = new Set(Object.entries(data)
      .filter(([name, rows]) => !baseline || baseline.get(name) !== JSON.stringify(rows))
      .map(([name]) => name));
    if (changed.size === 0) return actualRevision;
    // Full-table replacement must preserve SQLite foreign keys. A project
    // replacement can affect every child table; experiment treatments depend
    // on experiments, so replace them together in child-before-parent order.
    if (changed.has("projects")) {
      for (const name of Object.keys(data)) changed.add(name);
    } else if (changed.has("ascExperiments")) {
      changed.add("ascExperimentTreatments");
    }

    // Historical GSC query/page datasets grow quickly; only apply the row delta.
    // Keep full-table replacement for explicit project resets/migrations.
    if (baseline && !changed.has("projects")) {
      for (const [key, table] of [
        ["searchQueries", "search_queries"],
        ["pageMetrics", "page_metrics"],
      ] as const) {
        if (changed.has(key)) {
          writeGscRowDelta(database, table, JSON.parse(baseline.get(key) ?? "[]") as GscDetail[], data[key]);
          changed.delete(key);
        }
      }
    }

    if (changed.has("seoGeoObservations")) tx.delete(seoGeoObservationsTable).run();
    if (changed.has("searchQueries")) tx.delete(searchQueriesTable).run();
    if (changed.has("pageMetrics")) tx.delete(pageMetricsTable).run();
    if (changed.has("opportunities")) tx.delete(opportunitiesTable).run();
    if (changed.has("connectorRuns")) tx.delete(connectorRunsTable).run();
    if (changed.has("appReviews")) tx.delete(appReviewsTable).run();
    if (changed.has("appKeywords")) tx.delete(appKeywordsTable).run();
    if (changed.has("asoAppRankSnapshots")) tx.delete(asoAppRankSnapshotsTable).run();
    if (changed.has("gscDimensionBreakdowns")) tx.delete(gscDimensionBreakdownsTable).run();
    if (changed.has("gscSitemaps")) tx.delete(gscSitemapsTable).run();
    if (changed.has("gscIndexInspections")) tx.delete(gscIndexInspectionsTable).run();
    if (changed.has("admobMediationMetrics")) tx.delete(admobMediationMetricsTable).run();
    if (changed.has("ascMetadataSnapshots")) tx.delete(ascMetadataSnapshotsTable).run();
    if (changed.has("ascExperimentTreatments")) tx.delete(ascExperimentTreatmentsTable).run();
    if (changed.has("ascExperiments")) tx.delete(ascExperimentsTable).run();
    if (changed.has("playVitalsMetrics")) tx.delete(playVitalsMetricsTable).run();
    if (changed.has("playInstallStats")) tx.delete(playInstallStatsTable).run();
    if (changed.has("ascAnalyticsMetrics")) tx.delete(ascAnalyticsMetricsTable).run();
    if (changed.has("metricSnapshots")) tx.delete(metricSnapshotsTable).run();
    if (changed.has("projects")) tx.delete(projectsTable).run();
    if (changed.has("asoKeywordSnapshots")) tx.delete(asoKeywordSnapshotsTable).run();

    if (changed.has("projects")) for (const batch of chunk(data.projects, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(projectsTable).values(batch).run();
    }
    if (changed.has("metricSnapshots")) for (const batch of chunk(data.metricSnapshots, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(metricSnapshotsTable).values(batch).run();
    }
    if (changed.has("seoGeoObservations")) for (const batch of chunk(data.seoGeoObservations ?? [], INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(seoGeoObservationsTable).values(batch).run();
    }
    if (changed.has("searchQueries")) for (const batch of chunk(data.searchQueries, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(searchQueriesTable).values(batch).run();
    }
    if (changed.has("pageMetrics")) for (const batch of chunk(data.pageMetrics, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(pageMetricsTable).values(batch).run();
    }
    if (changed.has("opportunities")) for (const batch of chunk(data.opportunities, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(opportunitiesTable).values(batch).run();
    }
    if (changed.has("connectorRuns")) for (const batch of chunk(data.connectorRuns, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(connectorRunsTable).values(batch).run();
    }
    if (changed.has("appReviews")) for (const batch of chunk(data.appReviews, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) {
        tx.insert(appReviewsTable)
          .values(batch.map(({ text, ...rest }) => ({ ...rest, reviewText: text })))
          .run();
      }
    }
    if (changed.has("appKeywords")) for (const batch of chunk(data.appKeywords, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(appKeywordsTable).values(batch).run();
    }
    if (changed.has("asoKeywordSnapshots")) for (const batch of chunk(data.asoKeywordSnapshots, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(asoKeywordSnapshotsTable).values(batch).run();
    }
    if (changed.has("asoAppRankSnapshots")) for (const batch of chunk(data.asoAppRankSnapshots, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(asoAppRankSnapshotsTable).values(batch).run();
    }
    if (changed.has("gscDimensionBreakdowns")) for (const batch of chunk(data.gscDimensionBreakdowns, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(gscDimensionBreakdownsTable).values(batch).run();
    }
    if (changed.has("gscSitemaps")) for (const batch of chunk(data.gscSitemaps, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(gscSitemapsTable).values(batch).run();
    }
    if (changed.has("gscIndexInspections")) for (const batch of chunk(data.gscIndexInspections, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(gscIndexInspectionsTable).values(batch).run();
    }
    if (changed.has("admobMediationMetrics")) for (const batch of chunk(data.admobMediationMetrics, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(admobMediationMetricsTable).values(batch).run();
    }
    if (changed.has("ascMetadataSnapshots")) for (const batch of chunk(data.ascMetadataSnapshots, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(ascMetadataSnapshotsTable).values(batch).run();
    }
    if (changed.has("ascExperiments")) for (const batch of chunk(data.ascExperiments, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(ascExperimentsTable).values(batch).run();
    }
    if (changed.has("ascExperimentTreatments")) for (const batch of chunk(data.ascExperimentTreatments, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(ascExperimentTreatmentsTable).values(batch).run();
    }
    if (changed.has("playVitalsMetrics")) for (const batch of chunk(data.playVitalsMetrics, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(playVitalsMetricsTable).values(batch).run();
    }
    if (changed.has("playInstallStats")) for (const batch of chunk(data.playInstallStats, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(playInstallStatsTable).values(batch).run();
    }
    if (changed.has("ascAnalyticsMetrics")) for (const batch of chunk(data.ascAnalyticsMetrics, INSERT_CHUNK_SIZE)) {
      if (batch.length > 0) tx.insert(ascAnalyticsMetricsTable).values(batch).run();
    }
    getSqliteHandle(database)
      .prepare("UPDATE _openfindability_store_revision SET revision = revision + 1 WHERE id = 1")
      .run();
    return actualRevision + 1;
  });
  snapshotRevisions.set(data, revision);
  snapshotTableDigests.set(data, tableDigests(data));
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
    if (next !== data) {
      snapshotRevisions.set(next, snapshotRevisions.get(data)!);
      snapshotTableDigests.set(next, snapshotTableDigests.get(data)!);
    }
    try {
      await writeData(next);
      return next;
    } catch (error) {
      if (!(error instanceof StaleStoreSnapshotError) || attempt === 2) throw error;
    }
  }
  throw new Error("Unreachable store retry state.");
}
