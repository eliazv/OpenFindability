import { db, getSqliteHandle, type AppDb } from "@/lib/db/client";
import { and, eq, getTableColumns, gte, inArray, lte, sql } from "drizzle-orm";
import {
  ga4LandingMetrics as ga4LandingMetricsTable,
  webPerformanceMetrics as webPerformanceMetricsTable,
  projectInterventions as projectInterventionsTable,
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
    ga4LandingMetrics: database.select().from(ga4LandingMetricsTable).all(),
    webPerformanceMetrics: database.select().from(webPerformanceMetricsTable).all(),
    projectInterventions: database.select().from(projectInterventionsTable).all(),
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

    if (changed.has("ga4LandingMetrics")) tx.delete(ga4LandingMetricsTable).run();
    if (changed.has("webPerformanceMetrics")) tx.delete(webPerformanceMetricsTable).run();
    if (changed.has("projectInterventions")) tx.delete(projectInterventionsTable).run();
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
    if (changed.has("ga4LandingMetrics")) for (const batch of chunk(data.ga4LandingMetrics ?? [], INSERT_CHUNK_SIZE)) {
      if (batch.length) tx.insert(ga4LandingMetricsTable).values(batch).run();
    }
    if (changed.has("webPerformanceMetrics")) for (const batch of chunk(data.webPerformanceMetrics ?? [], INSERT_CHUNK_SIZE)) {
      if (batch.length) tx.insert(webPerformanceMetricsTable).values(batch).run();
    }
    if (changed.has("projectInterventions")) for (const batch of chunk(data.projectInterventions ?? [], INSERT_CHUNK_SIZE)) {
      if (batch.length) tx.insert(projectInterventionsTable).values(batch).run();
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

/** Only the projects table: avoids loading the whole store for CLI lookups. */
export function readProjectsWith(database:AppDb):Project[]{return database.select().from(projectsTable).all().map(denull) as Project[];}
export async function readProjects(): Promise<Project[]> {return readProjectsWith(db);}

export type ProjectUpdates = Partial<Omit<Project, "id" | "slug" | "createdAt" | "updatedAt">>;

/** Update one metadata row without materializing or replacing analytical tables. */
export function updateProjectWith(database: AppDb, slug: string, changes: ProjectUpdates): Project {
  if (["id", "slug", "createdAt", "updatedAt"].some((key) => Object.hasOwn(changes, key))) throw new Error("Project identity and timestamps cannot be supplied as updates.");
  const native = getSqliteHandle(database);
  return native.transaction(() => {
    const project = database.update(projectsTable).set({ ...changes, updatedAt: new Date().toISOString() })
      .where(eq(projectsTable.slug, slug)).returning().get();
    if (!project) throw new Error(`No project with slug "${slug}" found. Use project:add first.`);
    native.prepare("UPDATE _openfindability_store_revision SET revision = revision + 1 WHERE id = 1").run();
    return denull(project) as Project;
  }).immediate();
}

export async function updateProject(slug: string, changes: ProjectUpdates): Promise<Project> {
  return updateProjectWith(db, slug, changes);
}

/**
 * Appends one connector run without a full read/write of the store, which
 * exhausts the Node heap once the database grows to hundreds of MB.
 */
export async function appendConnectorRun(run: ConnectorRun): Promise<void> {
  db.transaction((tx) => {
    tx.insert(connectorRunsTable).values(run).run();
    getSqliteHandle(db)
      .prepare("UPDATE _openfindability_store_revision SET revision = revision + 1 WHERE id = 1")
      .run();
  });
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

/** Read-only dashboard projection; deliberately never registered as a writable snapshot. */
export type DashboardScope = "portfolio"|"overview"|"acquisition"|"store"|"revenue"|"health"|"opportunities"|"interventions"|"settings"|"data"|"growth";
export function readDashboardDataWith(database: AppDb, scope: DashboardScope, slug?: string, days=365, window?:{from:string;to:string}): AppData {
 return getSqliteHandle(database).transaction(() => {
  const projects = database.select().from(projectsTable).where(slug ? eq(projectsTable.slug, slug) : undefined).all().map(denull) as Project[];
  // Unknown slugs must never fall through to a global read.
  const projectId = slug ? projects[0]?.id ?? "__dashboard_missing_project__" : undefined;
  const {rawJson: _metricSnapshotsRaw, ...metricSnapshotsColumns} = getTableColumns(metricSnapshotsTable);
  const {rawJson: _opportunitiesRaw, ...opportunitiesColumns} = getTableColumns(opportunitiesTable);
  const {rawJson: _appReviewsRaw, ...appReviewsColumns} = getTableColumns(appReviewsTable);
  const {rawJson: _appKeywordsRaw, ...appKeywordsColumns} = getTableColumns(appKeywordsTable);
  const {rawJson: _asoKeywordSnapshotsRaw, ...asoKeywordSnapshotsColumns} = getTableColumns(asoKeywordSnapshotsTable);
  const {rawJson: _asoAppRankSnapshotsRaw, ...asoAppRankSnapshotsColumns} = getTableColumns(asoAppRankSnapshotsTable);
  const {rawJson: _gscDimensionBreakdownsRaw, ...gscDimensionBreakdownsColumns} = getTableColumns(gscDimensionBreakdownsTable);
  const {rawJson: _gscSitemapsRaw, ...gscSitemapsColumns} = getTableColumns(gscSitemapsTable);
  const {rawJson: _gscIndexInspectionsRaw, ...gscIndexInspectionsColumns} = getTableColumns(gscIndexInspectionsTable);
  const {rawJson: _admobMediationMetricsRaw, ...admobMediationMetricsColumns} = getTableColumns(admobMediationMetricsTable);
  const {rawJson: _ascMetadataSnapshotsRaw, ...ascMetadataSnapshotsColumns} = getTableColumns(ascMetadataSnapshotsTable);
  const {rawJson: _ascExperimentsRaw, ...ascExperimentsColumns} = getTableColumns(ascExperimentsTable);
  const {rawJson: _ascExperimentTreatmentsRaw, ...ascExperimentTreatmentsColumns} = getTableColumns(ascExperimentTreatmentsTable);
  const {rawJson: _playVitalsMetricsRaw, ...playVitalsMetricsColumns} = getTableColumns(playVitalsMetricsTable);
  const {rawJson: _playInstallStatsRaw, ...playInstallStatsColumns} = getTableColumns(playInstallStatsTable);
  const {rawJson: _ascAnalyticsMetricsRaw, ...ascAnalyticsMetricsColumns} = getTableColumns(ascAnalyticsMetricsTable);
  const {rawJson: _ga4LandingMetricsRaw, ...ga4LandingMetricsColumns} = getTableColumns(ga4LandingMetricsTable);
  const {rawJson: _webPerformanceMetricsRaw, ...webPerformanceMetricsColumns} = getTableColumns(webPerformanceMetricsTable);
  const {rawJson: _seoGeoObservationsRaw, ...seoGeoObservationsColumns} = getTableColumns(seoGeoObservationsTable);
  const onlyFreshness = scope === "portfolio" || scope === "overview" || scope === "settings" || scope === "data";
  const statusOnly = scope === "settings" || scope === "data";
  const boundedDays=Number.isSafeInteger(days)&&days>=1&&days<=365?days:365;
  const metricSnapshots = (["portfolio","overview","acquisition","store","revenue","health","settings","data","interventions","growth"].includes(scope) ? database.select(scope === "interventions" ? getTableColumns(metricSnapshotsTable) : { ...metricSnapshotsColumns, rawJson: sql<unknown>`NULL` }).from(metricSnapshotsTable).where(and(projectId ? eq(metricSnapshotsTable.projectId, projectId) : undefined, statusOnly ? sql`${metricSnapshotsTable.id} IN (SELECT id FROM metric_snapshots ${projectId?sql`WHERE project_id=${projectId}`:sql``} GROUP BY project_id, source HAVING max(date) IS NOT NULL)` : undefined)).all().map(denull) as MetricSnapshot[] : []);
  // GSC detail tables hold hundreds of thousands of rows with large rawJson: never load them whole.
  // Acquisition reads bounded SQL results via readGscExplorer(); interventions only need target URLs around their dates.
  const searchQueries: SearchQueryMetric[] = [];
  const pageMetrics = (scope === "interventions" && slug ? readInterventionPageMetrics(database, projectId!) : []);
  const opportunities = (["portfolio","overview","opportunities","growth"].includes(scope) ? database.select().from(opportunitiesTable).where(and(projectId ? eq(opportunitiesTable.projectId, projectId) : undefined, scope==="portfolio"||scope==="overview"?eq(opportunitiesTable.status,"open"):undefined)).all().map(denull) as Opportunity[] : []);
  const connectorRuns = (["portfolio","overview","settings","data","growth"].includes(scope) ? database.select().from(connectorRunsTable).where(and(projectId ? eq(connectorRunsTable.projectId, projectId) : undefined, scope==="portfolio"||scope==="overview"?sql`${connectorRunsTable.id} IN (SELECT id FROM connector_runs ${projectId?sql`WHERE project_id=${projectId}`:sql``} GROUP BY project_id, source, status HAVING max(finished_at) IS NOT NULL)`:undefined)).all().map(denull) as ConnectorRun[] : []);

  const appReviews = (["store"].includes(scope) ? database.select(appReviewsColumns).from(appReviewsTable).where(projectId ? eq(appReviewsTable.projectId, projectId) : undefined)
    .all()
    .map((row) => {
      const { reviewText, ...rest } = denull(row);
      return { ...rest, text: reviewText } as AppReview;
    }) : []);

  // appRank is nullable (not just optional) for these two tables, so keep the literal null from the row.
  const appKeywords = (["portfolio","overview","store","settings","data"].includes(scope) ? database.select(appKeywordsColumns).from(appKeywordsTable).where(and(projectId ? eq(appKeywordsTable.projectId, projectId) : undefined, onlyFreshness ? sql`${appKeywordsTable.id} IN (SELECT id FROM app_keywords ${projectId?sql`WHERE project_id=${projectId}`:sql``} GROUP BY project_id HAVING max(date) IS NOT NULL)` : undefined))
    .all()
    .map((row) => ({ ...denull(row), appRank: row.appRank })) as AppKeywordMetric[] : []);

  const asoKeywordSnapshots = (["store"].includes(scope) ? database.select(asoKeywordSnapshotsColumns).from(asoKeywordSnapshotsTable).where(projectId ? sql`(EXISTS (SELECT 1 FROM app_keywords ak WHERE ak.project_id=${projectId} AND ak.keyword=${asoKeywordSnapshotsTable.keyword} AND ak.country=${asoKeywordSnapshotsTable.country}) OR EXISTS (SELECT 1 FROM json_each(${JSON.stringify(projects[0]?.asoKeywords??[])}) k WHERE lower(k.value)=lower(${asoKeywordSnapshotsTable.keyword})) AND (${!(projects[0]?.asoCountries?.length)} OR EXISTS (SELECT 1 FROM json_each(${JSON.stringify(projects[0]?.asoCountries??[])}) c WHERE c.value=${asoKeywordSnapshotsTable.country})))` : undefined).all().map(denull) as AsoKeywordSnapshot[] : []);

  const asoAppRankSnapshots = (["store"].includes(scope) ? database.select(asoAppRankSnapshotsColumns).from(asoAppRankSnapshotsTable).where(projectId ? eq(asoAppRankSnapshotsTable.projectId, projectId) : undefined)
    .all()
    .map((row) => ({ ...denull(row), appRank: row.appRank })) as AsoAppRankSnapshot[] : []);

  const gscDimensionBreakdowns = (["acquisition"].includes(scope) ? database.select(gscDimensionBreakdownsColumns).from(gscDimensionBreakdownsTable).where(projectId ? eq(gscDimensionBreakdownsTable.projectId, projectId) : undefined)
    .all()
    .map(denull) as GscDimensionBreakdown[] : []);

  const gscSitemaps = (["health"].includes(scope) ? database.select(gscSitemapsColumns).from(gscSitemapsTable).where(projectId ? eq(gscSitemapsTable.projectId, projectId) : undefined).all().map(denull) as GscSitemap[] : []);

  const gscIndexInspections = (["health","data"].includes(scope) ? database.select(gscIndexInspectionsColumns).from(gscIndexInspectionsTable).where(projectId ? eq(gscIndexInspectionsTable.projectId, projectId) : undefined)
    .all()
    .map(denull) as GscIndexInspection[] : []);

  const admobMediationMetrics = (["portfolio","overview","revenue","settings","data","growth"].includes(scope) ? database.select(admobMediationMetricsColumns).from(admobMediationMetricsTable).where(and(projectId ? eq(admobMediationMetricsTable.projectId, projectId) : undefined, statusOnly ? sql`${admobMediationMetricsTable.id} IN (SELECT id FROM admob_mediation_metrics ${projectId?sql`WHERE project_id=${projectId}`:sql``} GROUP BY project_id HAVING max(date) IS NOT NULL)` : undefined))
    .all()
    .map(denull) as AdmobMediationMetric[] : []);

  const ascMetadataSnapshots = (["store"].includes(scope) ? database.select(ascMetadataSnapshotsColumns).from(ascMetadataSnapshotsTable).where(projectId ? eq(ascMetadataSnapshotsTable.projectId, projectId) : undefined)
    .all()
    .map(denull) as AscMetadataSnapshot[] : []);

  const ascExperiments = (["store"].includes(scope) ? database.select(ascExperimentsColumns).from(ascExperimentsTable).where(projectId ? eq(ascExperimentsTable.projectId, projectId) : undefined).all().map(denull) as AscExperiment[] : []);

  const ascExperimentTreatments = (["store"].includes(scope) ? database.select(ascExperimentTreatmentsColumns).from(ascExperimentTreatmentsTable).where(ascExperiments.length ? inArray(ascExperimentTreatmentsTable.experimentId, ascExperiments.map(r=>r.id)) : sql`0`)
    .all()
    .map(denull) as AscExperimentTreatment[] : []);

  const playVitalsMetrics = (["portfolio","overview","health","settings","data","growth"].includes(scope) ? database.select(playVitalsMetricsColumns).from(playVitalsMetricsTable).where(and(projectId ? eq(playVitalsMetricsTable.projectId, projectId) : undefined, onlyFreshness ? sql`${playVitalsMetricsTable.id} IN (SELECT id FROM play_vitals_metrics ${projectId?sql`WHERE project_id=${projectId}`:sql``} GROUP BY project_id HAVING max(date) IS NOT NULL)` : undefined)).all().map(denull) as PlayVitalsMetric[] : []);

  const playInstallStats = (["portfolio","overview","acquisition","store","settings","data","growth"].includes(scope) ? database.select(playInstallStatsColumns).from(playInstallStatsTable).where(and(projectId ? eq(playInstallStatsTable.projectId, projectId) : undefined, statusOnly ? sql`${playInstallStatsTable.id} IN (SELECT id FROM play_install_stats ${projectId?sql`WHERE project_id=${projectId}`:sql``} GROUP BY project_id HAVING max(date) IS NOT NULL)` : undefined)).all().map(denull) as PlayInstallStat[] : []);

  const ascAnalyticsMetrics = (["portfolio","overview","acquisition","store","settings","data"].includes(scope) ? database.select(ascAnalyticsMetricsColumns).from(ascAnalyticsMetricsTable).where(and(projectId ? eq(ascAnalyticsMetricsTable.projectId, projectId) : undefined, statusOnly ? sql`${ascAnalyticsMetricsTable.id} IN (SELECT id FROM asc_analytics_metrics ${projectId?sql`WHERE project_id=${projectId}`:sql``} GROUP BY project_id HAVING max(date) IS NOT NULL)` : undefined))
    .all()
    .map(denull) as AscAnalyticsMetric[] : []);

  const snapshot: AppData = {
    ga4LandingMetrics: (["portfolio","overview","acquisition","settings","data","interventions"].includes(scope) ? database.select(scope === "interventions" ? getTableColumns(ga4LandingMetricsTable) : { ...ga4LandingMetricsColumns, rawJson: sql<unknown>`NULL` }).from(ga4LandingMetricsTable).where(and(projectId ? eq(ga4LandingMetricsTable.projectId, projectId) : undefined, onlyFreshness ? sql`${ga4LandingMetricsTable.id} IN (SELECT id FROM ga4_landing_metrics ${projectId?sql`WHERE project_id=${projectId}`:sql``} GROUP BY project_id HAVING max(date) IS NOT NULL)` : undefined, scope==="acquisition"&&window?and(gte(ga4LandingMetricsTable.date,window.from),lte(ga4LandingMetricsTable.date,window.to)):scope==="acquisition"&&projectId ? sql`${ga4LandingMetricsTable.date} >= date((SELECT max(date) FROM ga4_landing_metrics WHERE project_id=${projectId}), ${"-"+(boundedDays-1)+" days"})` : undefined)).all() : []),
    webPerformanceMetrics: (["health","settings","data","portfolio","overview"].includes(scope) ? database.select({ ...webPerformanceMetricsColumns, rawJson: sql<unknown>`NULL` }).from(webPerformanceMetricsTable).where(and(projectId ? eq(webPerformanceMetricsTable.projectId, projectId) : undefined, onlyFreshness ? sql`${webPerformanceMetricsTable.id} IN (SELECT id FROM web_performance_metrics WHERE status='available' ${projectId?sql`AND project_id=${projectId}`:sql``} GROUP BY project_id, source HAVING max(date) IS NOT NULL)` : undefined)).all() : []),
    projectInterventions: (["overview","acquisition","store","revenue","health","interventions"].includes(scope) ? database.select().from(projectInterventionsTable).where(projectId ? eq(projectInterventionsTable.projectId, projectId) : undefined).all() : []),
    seoGeoObservations: (["portfolio","overview","acquisition","settings","data"].includes(scope) ? database.select({ ...seoGeoObservationsColumns, rawJson: sql<unknown>`NULL` }).from(seoGeoObservationsTable).where(and(projectId ? eq(seoGeoObservationsTable.projectId, projectId) : undefined, onlyFreshness ? sql`${seoGeoObservationsTable.id} IN (SELECT id FROM seo_geo_observations ${projectId?sql`WHERE project_id=${projectId}`:sql``} GROUP BY project_id, source HAVING max(window_end) IS NOT NULL)` : undefined)).all() as NonNullable<AppData["seoGeoObservations"]> : []),
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
  return snapshot;
 })();
}
export async function readDashboardData(scope: DashboardScope, slug?: string, days=365,window?:{from:string;to:string}): Promise<AppData> {return readDashboardDataWith(db,scope,slug,days,window);}

const DAILY_GSC_DETAIL = `json_extract(raw_json,'$._openfindability.grain')='day' AND json_extract(raw_json,'$._openfindability.version')=2`;

/** Page rows for intervention targets only, within the widest comparison window (90 days each side). */
function readInterventionPageMetrics(database: AppDb, projectId: string): PageMetric[] {
  const interventions = database.select().from(projectInterventionsTable).where(eq(projectInterventionsTable.projectId, projectId)).all().filter((r) => r.targetUrl);
  if (!interventions.length) return [];
  const shift = (date: string, n: number) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
  const dates = interventions.map((r) => r.date).sort();
  const prefixes = [...new Set(interventions.map((r) => { const u = new URL(r.targetUrl!); return u.origin + u.pathname; }))];
  return database.select().from(pageMetricsTable).where(and(
    eq(pageMetricsTable.projectId, projectId),
    gte(pageMetricsTable.date, shift(dates[0], -90)),
    lte(pageMetricsTable.date, shift(dates.at(-1)!, 90)),
    inArray(pageMetricsTable.page, prefixes),
  )).all().map(denull) as PageMetric[];
}

export type GscDetailAggregate = { key: string; clicks: number; impressions: number; ctr: number; avgPosition: number };
/** Daily-grain GSC query/page totals for one project and window, aggregated in SQLite. */
export function readGscDetailAggregatesWith(database: AppDb, projectId: string, from: string, to: string) {
  const sqlite = getSqliteHandle(database);
  const aggregate = (table: "search_queries" | "page_metrics", column: "query" | "page") => (sqlite.prepare(`
    SELECT ${column} AS key, SUM(clicks) AS clicks, SUM(impressions) AS impressions, SUM(avg_position*impressions) AS weighted
    FROM ${table} WHERE project_id=? AND date>=? AND date<=? AND ${DAILY_GSC_DETAIL}
    GROUP BY ${column} ORDER BY impressions DESC`).all(projectId, from, to) as { key: string; clicks: number; impressions: number; weighted: number }[])
    .map(({ key, clicks, impressions, weighted }): GscDetailAggregate => ({ key, clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, avgPosition: impressions > 0 ? weighted / impressions : 0 }));
  const hasRows = (sqlite.prepare("SELECT EXISTS(SELECT 1 FROM search_queries WHERE project_id=?) OR EXISTS(SELECT 1 FROM page_metrics WHERE project_id=?) AS v").get(projectId, projectId) as { v: number }).v === 1;
  return { queries: aggregate("search_queries", "query"), pages: aggregate("page_metrics", "page"), hasRows };
}
export async function readGscDetailAggregates(projectId: string, from: string, to: string) { return readGscDetailAggregatesWith(db, projectId, from, to); }

export type GscExplorerInput = {search?:string;sort?:string;page?:string};
export type GscExplorerPage = {rows:GscDetailAggregate[];total:number;page:number};
/** Aggregation remains in SQLite. Only the requested page and bounded chart samples cross into JS. */
export function readGscExplorerWith(database:AppDb,projectId:string,from:string,to:string,queryInput:GscExplorerInput={},pageInput:GscExplorerInput={}){
 const sqlite=getSqliteHandle(database);
 const read=(table:"search_queries"|"page_metrics",column:"query"|"page",input:GscExplorerInput,preview:boolean)=>{
  const [sortIndex,dir]=(input.sort??"1:desc").split(":");
  const sortColumn=/^[0-4]$/.test(sortIndex)?["key COLLATE NOCASE","clicks","impressions","ctr","position"][Number(sortIndex)]:"clicks";
  const direction=dir==="asc"?"ASC":"DESC";
  const search=(input.search??"").trim().slice(0,200);
  const requested=Math.min(1000000,Math.max(1,Number.parseInt(input.page??"1",10)||1));
  // Search is on the query/URL itself. Stable sort, NULL ratios last, literal substring search.
  const result=sqlite.prepare(`
   WITH aggregates AS MATERIALIZED (
    SELECT ${column} AS key,SUM(clicks) AS clicks,SUM(impressions) AS impressions,
     SUM(clicks)*1.0/NULLIF(SUM(impressions),0) AS ctr,
     SUM(avg_position*impressions)*1.0/NULLIF(SUM(impressions),0) AS position
    FROM ${table} WHERE project_id=? AND date>=? AND date<=? AND ${DAILY_GSC_DETAIL}
    GROUP BY ${column}
   ), matched AS (
    SELECT *,CASE WHEN instr(lower(key),lower(?))>0 OR ?='' THEN 1 ELSE 0 END AS matches FROM aggregates
   ), ranked AS (
    SELECT *,SUM(matches) OVER() AS total,
      ROW_NUMBER() OVER(ORDER BY matches DESC, (${sortColumn} IS NULL), ${sortColumn} ${direction},key) AS rownum
      ${preview?", ROW_NUMBER() OVER(ORDER BY clicks DESC,key) AS click_rank, ROW_NUMBER() OVER(ORDER BY impressions DESC,key) AS impression_rank":", 0 AS click_rank, 0 AS impression_rank"}
    FROM matched
   ), bounded AS (
    SELECT *,min(?,max(1,(total+24)/25)) AS page FROM ranked
   )
   SELECT * FROM bounded WHERE (matches=1 AND rownum>(page-1)*25 AND rownum<=page*25)
   ${preview?"OR click_rank<=10 OR impression_rank<=200":""}
   ORDER BY rownum
  `).all(projectId,from,to,search,search,requested) as {key:string;clicks:number;impressions:number;ctr:number|null;position:number|null;matches:number;total:number;rownum:number;page:number;click_rank:number;impression_rank:number}[];
  const total=result[0]?.total??0,page=result[0]?.page??1;
  const map=(r:typeof result[number]):GscDetailAggregate=>({key:r.key,clicks:r.clicks,impressions:r.impressions,ctr:r.ctr??0,avgPosition:r.position??0});
  return {rows:result.filter(r=>r.matches===1&&r.rownum>(page-1)*25&&r.rownum<=page*25).map(map),total,page,topClicks:preview?result.filter(r=>r.click_rank<=10).sort((a,b)=>a.click_rank-b.click_rank).map(map):[],topImpressions:preview?result.filter(r=>r.impression_rank<=200).sort((a,b)=>a.impression_rank-b.impression_rank).map(map):[]};
 };
 const queries=read("search_queries","query",queryInput,true),pages=read("page_metrics","page",pageInput,false);
 const hasRows=(sqlite.prepare("SELECT EXISTS(SELECT 1 FROM search_queries WHERE project_id=?) OR EXISTS(SELECT 1 FROM page_metrics WHERE project_id=?) AS v").get(projectId,projectId) as {v:number}).v===1;
 return {queries,pages,hasRows};
}
export async function readGscExplorer(projectId:string,from:string,to:string,queryInput:GscExplorerInput,pageInput:GscExplorerInput){return readGscExplorerWith(db,projectId,from,to,queryInput,pageInput);}
