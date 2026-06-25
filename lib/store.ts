import { db, type AppDb } from "@/lib/db/client";
import {
  appKeywords as appKeywordsTable,
  appReviews as appReviewsTable,
  asoAppRankSnapshots as asoAppRankSnapshotsTable,
  asoKeywordSnapshots as asoKeywordSnapshotsTable,
  connectorRuns as connectorRunsTable,
  metricSnapshots as metricSnapshotsTable,
  opportunities as opportunitiesTable,
  pageMetrics as pageMetricsTable,
  projects as projectsTable,
  searchQueries as searchQueriesTable,
} from "@/lib/db/schema";
import type {
  AppData,
  AppKeywordMetric,
  AppReview,
  AsoAppRankSnapshot,
  AsoKeywordSnapshot,
  ConnectorRun,
  MetricSnapshot,
  Opportunity,
  PageMetric,
  Project,
  SearchQueryMetric,
} from "@/lib/types";

export { getDbFilePath as getDataFilePath } from "@/lib/db/client";

const INSERT_CHUNK_SIZE = 50;

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

  return {
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
  };
}

export function writeDataWith(database: AppDb, data: AppData): void {
  database.transaction((tx) => {
    tx.delete(searchQueriesTable).run();
    tx.delete(pageMetricsTable).run();
    tx.delete(opportunitiesTable).run();
    tx.delete(connectorRunsTable).run();
    tx.delete(appReviewsTable).run();
    tx.delete(appKeywordsTable).run();
    tx.delete(asoAppRankSnapshotsTable).run();
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
  });
}

export async function readData(): Promise<AppData> {
  return readDataWith(db);
}

export async function writeData(data: AppData): Promise<void> {
  writeDataWith(db, data);
}

export async function updateData(mutator: (data: AppData) => AppData | void): Promise<AppData> {
  const data = await readData();
  const next = mutator(data) ?? data;
  await writeData(next);
  return next;
}
