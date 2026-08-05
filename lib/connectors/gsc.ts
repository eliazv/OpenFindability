import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import { createId } from "@/lib/id";
import type {
  GscDimension,
  GscDimensionBreakdown,
  GscSitemap,
  MetricSnapshot,
  PageMetric,
  Project,
  SearchQueryMetric,
  SyncResult,
} from "@/lib/types";

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
  breakdowns: GscDimensionBreakdown[];
  sitemaps: GscSitemap[];
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

  const [dateRows, queryRows, pageRows, deviceRows, countryRows, appearanceRows, sitemapEntries] = await Promise.all([
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["date"]),
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["query", "page"]),
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["page"]),
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["device"]),
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["country"]),
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["searchAppearance"]),
    listSitemaps(searchconsole, project.gscProperty),
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

  const breakdowns = [
    ...toBreakdownRows(project.id, "device", deviceRows, startDate, endDate, createdAt),
    ...toBreakdownRows(project.id, "country", countryRows, startDate, endDate, createdAt),
    ...toBreakdownRows(project.id, "searchAppearance", appearanceRows, startDate, endDate, createdAt),
  ];

  const sitemaps = sitemapEntries.map((entry) => ({
    id: createId("sitemap"),
    projectId: project.id,
    path: entry.path ?? "",
    type: entry.type ?? undefined,
    lastSubmitted: entry.lastSubmitted ?? undefined,
    isPending: entry.isPending ?? false,
    isSitemapsIndex: entry.isSitemapsIndex ?? false,
    warnings: Number(entry.warnings ?? 0),
    errors: Number(entry.errors ?? 0),
    rawJson: entry,
    createdAt,
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
    breakdowns,
    sitemaps,
  };
}

function toBreakdownRows(
  projectId: string,
  dimension: GscDimension,
  rows: GscRow[],
  rangeStart: string,
  rangeEnd: string,
  createdAt: string,
): GscDimensionBreakdown[] {
  return rows.map((row) => ({
    id: createId("gscbrk"),
    projectId,
    rangeStart,
    rangeEnd,
    dimension,
    key: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    avgPosition: row.position ?? 0,
    rawJson: row,
    createdAt,
  }));
}

export type GscSite = {
  siteUrl: string;
  permissionLevel?: string | null;
};

export async function listGscSites(): Promise<GscSite[]> {
  const searchconsole = await createGscClient();
  const response = await searchconsole.sites.list({});

  return (response.data.siteEntry ?? []).map((entry) => ({
    siteUrl: entry.siteUrl ?? "",
    permissionLevel: entry.permissionLevel,
  }));
}

export async function createGscClient(): Promise<ReturnType<typeof google.searchconsole>> {
  const auth = await getGoogleAuth();
  if (!auth) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE is not configured.");
  }
  return google.searchconsole({ version: "v1", auth });
}

type SitemapEntry = {
  path?: string | null;
  type?: string | null;
  lastSubmitted?: string | null;
  isPending?: boolean | null;
  isSitemapsIndex?: boolean | null;
  warnings?: string | number | null;
  errors?: string | number | null;
};

export async function listSitemaps(
  searchconsole: ReturnType<typeof google.searchconsole>,
  siteUrl: string,
): Promise<SitemapEntry[]> {
  const response = await searchconsole.sitemaps.list({ siteUrl });
  return (response.data.sitemap ?? []) as SitemapEntry[];
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
    breakdowns: [],
    sitemaps: [],
  };
}
