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

export async function syncGscProject(project: Project, startDate: string, endDate: string, options: { details?: boolean } = {}): Promise<{
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

  // A "query + page" row over a 30-day window is NOT a daily observation. Fetch
  // date-qualified rows in bounded windows so page/query history has a real day.
  // Small windows also avoid starving low-traffic days behind GSC's top-row cap.
  const [dateRows, queryDetails, pageDetails, deviceRows, countryRows, appearanceRows, sitemapEntries] = await Promise.all([
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["date"]),
    options.details === false ? Promise.resolve({ rows: [], capped: false }) : queryDailyDetails(searchconsole, project.gscProperty, startDate, endDate, ["query", "page"]),
    options.details === false ? Promise.resolve({ rows: [], capped: false }) : queryDailyDetails(searchconsole, project.gscProperty, startDate, endDate, ["page"]),
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["device"]),
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["country"]),
    querySearchAnalytics(searchconsole, project.gscProperty, startDate, endDate, ["searchAppearance"]),
    listSitemaps(searchconsole, project.gscProperty),
  ]);
  const queryRows = queryDetails.rows;
  const pageRows = pageDetails.rows;

  // Reject malformed API rows before writing any of the batch to SQLite.
  for (const row of dateRows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.keys?.[0] ?? "")) {
      throw new Error("GSC returned a daily total without a valid date key.");
    }
  }
  for (const row of queryRows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.keys?.[0] ?? "") || !row.keys?.[1] || !row.keys?.[2]) {
      throw new Error("GSC returned a query/page row with missing daily dimensions.");
    }
  }
  for (const row of pageRows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.keys?.[0] ?? "") || !row.keys?.[1]) {
      throw new Error("GSC returned a page row with missing daily dimensions.");
    }
  }

  const snapshots = dateRows.map((row) => ({
    id: createId("metric"),
    projectId: project.id,
    source: "gsc" as const,
    date: row.keys![0],
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
    date: row.keys![0],
    query: row.keys![1],
    page: row.keys![2],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    avgPosition: row.position ?? 0,
    rawJson: dailyDetailPayload(row, project.gscProperty!, createdAt, queryDetails.capped),
  }));

  const pages = pageRows.map((row) => ({
    id: createId("page"),
    projectId: project.id,
    date: row.keys![0],
    page: row.keys![1],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    avgPosition: row.position ?? 0,
    rawJson: dailyDetailPayload(row, project.gscProperty!, createdAt, pageDetails.capped),
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
      message: `Imported daily GSC data from ${startDate} to ${endDate}.${queryDetails.capped || pageDetails.capped ? " Detail reached Google's row cap for at least one day; saved rows are top results only." : ""}`,
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

const GSC_ROW_LIMIT = 25_000;
const GSC_MAX_ROWS = 50_000;
const DETAIL_WINDOW_DAYS = 7;

type GscDetailResponse = { rows: GscRow[]; capped: boolean };

function dailyDetailPayload(row: GscRow, property: string, fetchedAt: string, capped: boolean) {
  return {
    ...row,
    _openfindability: {
      version: 2,
      grain: "day" as const,
      property,
      fetchedAt,
      // Google does not expose all anonymized query data even with pagination.
      coverage: "top_rows_only" as const,
      hitRowCap: capped,
    },
  };
}

// Date arithmetic must be in UTC: local DST changes cannot skip/duplicate a day.
function gscDateWindows(startDate: string, endDate: string, daysPerWindow = DETAIL_WINDOW_DAYS) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new Error(`Invalid GSC date range: ${startDate}..${endDate}`);
  }
  const result: Array<{ start: string; end: string }> = [];
  const dayMs = 86_400_000;
  for (let time = start; time <= end; time += daysPerWindow * dayMs) {
    result.push({
      start: new Date(time).toISOString().slice(0, 10),
      end: new Date(Math.min(end, time + (daysPerWindow - 1) * dayMs)).toISOString().slice(0, 10),
    });
  }
  return result;
}

/**
 * Page/query history is collected by actual calendar day rather than assigning
 * a multi-day aggregate to endDate. If a seven-day window hits the export cap,
 * retry each day separately to give every day a chance to be represented.
 */
export async function queryDailyDetails(
  searchconsole: ReturnType<typeof google.searchconsole>,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
): Promise<GscDetailResponse> {
  const rows: GscRow[] = [];
  let capped = false;
  for (const window of gscDateWindows(startDate, endDate)) {
    const batch = await pagedSearchAnalytics(searchconsole, siteUrl, window.start, window.end, ["date", ...dimensions]);
    if (batch.capped && window.start !== window.end) {
      for (const single of gscDateWindows(window.start, window.end, 1)) {
        const day = await pagedSearchAnalytics(searchconsole, siteUrl, single.start, single.end, ["date", ...dimensions]);
        rows.push(...day.rows);
        capped ||= day.capped;
      }
    } else {
      rows.push(...batch.rows);
      capped ||= batch.capped;
    }
  }
  return { rows, capped };
}

async function querySearchAnalytics(
  searchconsole: ReturnType<typeof google.searchconsole>,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
): Promise<GscRow[]> {
  return (await pagedSearchAnalytics(searchconsole, siteUrl, startDate, endDate, dimensions)).rows;
}

export async function pagedSearchAnalytics(
  searchconsole: ReturnType<typeof google.searchconsole>,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
): Promise<GscDetailResponse> {
  const rows: GscRow[] = [];
  const hasPage = dimensions.includes("page");
  for (let startRow = 0; startRow < GSC_MAX_ROWS; startRow += GSC_ROW_LIMIT) {
    const response = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions,
        type: "web",
        dataState: "final",
        // Search appearance may require Google to choose a compatible grouping.
        aggregationType: hasPage ? "byPage" : dimensions.includes("searchAppearance") ? "auto" : "byProperty",
        rowLimit: GSC_ROW_LIMIT,
        startRow,
      },
    });
    const page = (response.data.rows ?? []) as GscRow[];
    rows.push(...page);
    if (page.length < GSC_ROW_LIMIT) return { rows, capped: false };
  }
  return { rows, capped: true };
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
