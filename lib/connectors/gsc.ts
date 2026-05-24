import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import { createId } from "@/lib/id";
import type { MetricSnapshot, PageMetric, Project, SearchQueryMetric, SyncResult } from "@/lib/types";

type GscRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export async function syncGscProject(project: Project, startDate: string, endDate: string): Promise<{
  result: SyncResult;
  snapshots: MetricSnapshot[];
  queries: SearchQueryMetric[];
  pages: PageMetric[];
}> {
  if (!project.gscProperty) {
    return skipped(project.id, "Project has no GSC property.");
  }

  const auth = await getGoogleAuth();
  if (!auth) {
    return skipped(project.id, "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE is not configured.");
  }

  const searchconsole = google.searchconsole({ version: "v1", auth });
  const createdAt = new Date().toISOString();

  const [dateRows, queryRows, pageRows] = await Promise.all([
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["date"]),
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["query", "page"]),
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["page"]),
  ]);

  const snapshots = dateRows.map((row) => ({
    id: createId("metric"),
    projectId: project.id,
    source: "gsc" as const,
    date: row.keys?.[0] ?? endDate,
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    avgPosition: row.position ?? 0,
    rawJson: row,
    createdAt,
  }));

  const queries = queryRows.map((row) => ({
    id: createId("query"),
    projectId: project.id,
    date: endDate,
    query: row.keys?.[0] ?? "",
    page: row.keys?.[1],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    avgPosition: row.position ?? 0,
    rawJson: row,
  }));

  const pages = pageRows.map((row) => ({
    id: createId("page"),
    projectId: project.id,
    date: endDate,
    page: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    avgPosition: row.position ?? 0,
    rawJson: row,
  }));

  return {
    result: {
      source: "gsc",
      projectId: project.id,
      status: "success",
      message: `Imported GSC data from ${startDate} to ${endDate}.`,
      inserted: {
        snapshots: snapshots.length,
        queries: queries.length,
        pages: pages.length,
      },
    },
    snapshots,
    queries,
    pages,
  };
}

async function getGoogleAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();

  if (!json && !file) {
    return null;
  }

  const credentials = JSON.parse(json || (await readFile(file as string, "utf8")));

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

async function querySearchAnalytics(
  searchconsole: ReturnType<typeof google.searchconsole>,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
): Promise<GscRow[]> {
  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions,
      rowLimit: 25000,
      startRow: 0,
    },
  });

  return (response.data.rows ?? []) as GscRow[];
}

function skipped(projectId: string, message: string) {
  return {
    result: {
      source: "gsc" as const,
      projectId,
      status: "skipped" as const,
      message,
      inserted: { snapshots: 0, queries: 0, pages: 0 },
    },
    snapshots: [],
    queries: [],
    pages: [],
  };
}
