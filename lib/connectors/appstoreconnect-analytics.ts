import { gunzipSync } from "node:zlib";
import { createId } from "@/lib/id";
import { getAscToken } from "@/lib/connectors/appstoreconnect";
import type { AscAnalyticsMetric, Project, SyncResult } from "@/lib/types";

// App Store Connect Analytics Reports API is JSON:API but with a request/poll/download
// flow ascFetch (appstoreconnect.ts) isn't shaped for: report *requests* and *instances*
// are JSON:API resources (fine), but report *segments* return a signed CDN URL whose body
// is a gzipped TSV, not JSON — so this file does its own raw fetch for that last hop.
const API_BASE = "https://api.appstoreconnect.apple.com/v1";

type JsonApiResource = { id: string; type: string; attributes?: Record<string, unknown> };
type JsonApiListDocument = { data: JsonApiResource[]; links?: { next?: string } };
type JsonApiDocument = { data: JsonApiResource };

async function ascAnalyticsFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAscToken();
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail = (body as { errors?: { title?: string; detail?: string; status?: string }[] } | undefined)?.errors
      ?.map((e) => `${e.status ?? ""} ${e.detail ?? e.title ?? ""}`.trim())
      .filter(Boolean)
      .join("; ");
    throw new Error(`App Store Connect Analytics API ${response.status} on ${path}${detail ? `: ${detail}` : ""}`);
  }
  return body as T;
}

async function ascAnalyticsFetchAllPages(path: string): Promise<JsonApiResource[]> {
  const results: JsonApiResource[] = [];
  let next: string | undefined = path;
  while (next) {
    const page: JsonApiListDocument = await ascAnalyticsFetch<JsonApiListDocument>(next);
    results.push(...page.data);
    next = page.links?.next;
  }
  return results;
}

// A request must exist before any report/instance/segment can be listed. The first request
// for a given (app) ever made requires an Admin-level API key; once it exists, a Sales/
// Finance/Reports-role key can read reports/instances/segments from it going forward.
export async function ensureOngoingAnalyticsRequest(appId: string): Promise<string> {
  const existing = await ascAnalyticsFetchAllPages(`/apps/${appId}/analyticsReportRequests?limit=50`);
  const ongoing = existing.find((req) => req.attributes?.accessType === "ONGOING");
  if (ongoing) return ongoing.id;

  const doc = await ascAnalyticsFetch<JsonApiDocument>("/analyticsReportRequests", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "analyticsReportRequests",
        attributes: { accessType: "ONGOING" },
        relationships: { app: { data: { type: "apps", id: appId } } },
      },
    }),
  });
  return doc.data.id;
}

type AscAnalyticsReport = { id: string; name: string; category?: string };

async function listReportsForRequest(requestId: string): Promise<AscAnalyticsReport[]> {
  const reports = await ascAnalyticsFetchAllPages(`/analyticsReportRequests/${requestId}/reports?limit=50`);
  return reports.map((r) => ({
    id: r.id,
    name: (r.attributes?.name as string | undefined) ?? "",
    category: r.attributes?.category as string | undefined,
  }));
}

async function latestInstance(reportId: string): Promise<{ id: string; processingDate?: string } | null> {
  // Apple rejects `sort` on this endpoint, so fetch everything available and pick the
  // most recent processingDate client-side.
  const instances = await ascAnalyticsFetchAllPages(`/analyticsReports/${reportId}/instances?limit=200`);
  if (instances.length === 0) return null;
  const withDates = instances
    .map((i) => ({ id: i.id, processingDate: i.attributes?.processingDate as string | undefined }))
    .sort((a, b) => (b.processingDate ?? "").localeCompare(a.processingDate ?? ""));
  return withDates[0];
}

type AnalyticsSegmentRow = Record<string, string>;

async function downloadSegments(instanceId: string): Promise<AnalyticsSegmentRow[]> {
  const segments = await ascAnalyticsFetchAllPages(`/analyticsReportInstances/${instanceId}/segments?limit=50`);
  const rows: AnalyticsSegmentRow[] = [];

  for (const segment of segments) {
    const url = segment.attributes?.url as string | undefined;
    if (!url) continue;
    const response = await fetch(url);
    if (!response.ok) continue;
    const compressed = Buffer.from(await response.arrayBuffer());
    const text = gunzipSync(compressed).toString("utf8");
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length === 0) continue;
    const headers = lines[0].split("\t");
    for (const line of lines.slice(1)) {
      const cells = line.split("\t");
      const row: AnalyticsSegmentRow = {};
      headers.forEach((header, idx) => {
        row[header] = cells[idx];
      });
      rows.push(row);
    }
  }

  return rows;
}

function findColumn(headers: string[], ...needles: string[]): string | undefined {
  return headers.find((h) => needles.some((needle) => h.toLowerCase().includes(needle.toLowerCase())));
}

// --- Sales Reports (downloads, historical) ---
// Apple's older Reports API (not the newer Analytics Reports API above) exposes daily
// SALES/SUMMARY reports with a real per-app Units column and up to 365 days of history,
// with no ONGOING-request/24-48h-wait dance — one authenticated GET per day, gzipped TSV
// body (note: `Accept: application/a-gzip`, not JSON — Apple 406s otherwise). The file
// covers every app under the whole account (vendor), so results are cached per date and
// shared across all projects synced in the same process run instead of refetching per app.
const SALES_REPORT_BASE = "https://api.appstoreconnect.apple.com/v1/salesReports";
const salesReportCache = new Map<string, Promise<Map<string, number> | null>>();

function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// Resolves to null when Apple has no report for that day (404/410 -- normal for days before
// the account existed or today's not-yet-processed day), or a map of Apple Identifier -> units
// summed across every non-in-app-purchase row (product type codes starting with "IA" are IAP,
// not app installs/redownloads).
function fetchSalesReportForDate(vendorNumber: string, date: string): Promise<Map<string, number> | null> {
  const cacheKey = `${vendorNumber}::${date}`;
  const cached = salesReportCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const token = await getAscToken();
    const url = `${SALES_REPORT_BASE}?${new URLSearchParams({
      "filter[frequency]": "DAILY",
      "filter[reportDate]": date,
      "filter[reportSubType]": "SUMMARY",
      "filter[reportType]": "SALES",
      "filter[vendorNumber]": vendorNumber,
    })}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/a-gzip" } });

    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`App Store Connect Sales Reports API ${response.status} on ${date}${body ? `: ${body}` : ""}`);
    }

    const compressed = Buffer.from(await response.arrayBuffer());
    const text = gunzipSync(compressed).toString("utf8");
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    const byApp = new Map<string, number>();
    if (lines.length < 2) return byApp;

    const headers = lines[0].split("\t");
    const appleIdIdx = headers.findIndex((h) => h.toLowerCase() === "apple identifier");
    const unitsIdx = headers.findIndex((h) => h.toLowerCase() === "units");
    const productTypeIdx = headers.findIndex((h) => h.toLowerCase() === "product type identifier");
    if (appleIdIdx === -1 || unitsIdx === -1) return byApp;

    for (const line of lines.slice(1)) {
      const cells = line.split("\t");
      const productType = productTypeIdx >= 0 ? cells[productTypeIdx] : "";
      if (productType?.toUpperCase().startsWith("IA")) continue; // in-app purchase, not an install
      const appleId = cells[appleIdIdx];
      if (!appleId) continue;
      const units = Number(cells[unitsIdx]) || 0;
      byApp.set(appleId, (byApp.get(appleId) ?? 0) + units);
    }
    return byApp;
  })();

  salesReportCache.set(cacheKey, promise);
  return promise;
}

export async function syncAscAnalyticsProject(
  project: Project,
  startDate: string,
  endDate: string,
): Promise<{ result: SyncResult; metrics: AscAnalyticsMetric[] }> {
  if (!project.appStoreTrackId) {
    return skipped(project.id, "Project has no App Store Connect track id (appStoreTrackId).");
  }

  const appId = String(project.appStoreTrackId);
  const createdAt = new Date().toISOString();
  const byDate = new Map<string, { downloads?: number; retentionDay1?: number; retentionDay7?: number; retentionDay28?: number; raw: Record<string, unknown> }>();

  // Downloads: Sales Reports (immediate, up to 365 days of history) when a vendor number is
  // configured. One HTTP call per calendar day, shared across every project via the module-
  // level cache above -- cheap even at full 30-project backfill since each day is fetched once.
  const vendorNumber = process.env.ASC_VENDOR_NUMBER?.trim();
  let salesReportsAvailable = false;
  let salesReportError: string | undefined;
  if (vendorNumber) {
    for (const date of enumerateDates(startDate, endDate)) {
      try {
        const byApp = await fetchSalesReportForDate(vendorNumber, date);
        if (!byApp) continue;
        const units = byApp.get(appId);
        if (units === undefined) continue;
        salesReportsAvailable = true;
        const entry = byDate.get(date) ?? { raw: {} };
        entry.downloads = units;
        entry.raw.salesReportUnits = units;
        byDate.set(date, entry);
      } catch (error) {
        salesReportError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  // Retention: Analytics Reports API (ONGOING request -> reports -> instances -> segments).
  // Best-effort and independent of Sales Reports above -- a failure here (e.g. the first
  // request needing an Admin-role key) must not wipe out downloads we already have.
  let analyticsNote: string | undefined;
  try {
    const requestId = await ensureOngoingAnalyticsRequest(appId);
    const reports = await listReportsForRequest(requestId);
    const sessionsReport = reports.find((r) => /session|retention|engagement/i.test(r.name));

    if (sessionsReport) {
      await attachSessionsRetention(sessionsReport.id, startDate, endDate, byDate);
    }
  } catch (error) {
    analyticsNote = `retention unavailable (${error instanceof Error ? error.message : String(error)})`;
  }

  const metrics: AscAnalyticsMetric[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      id: createId("ascanalytics"),
      projectId: project.id,
      date,
      downloads: values.downloads,
      retentionDay1: values.retentionDay1,
      retentionDay7: values.retentionDay7,
      retentionDay28: values.retentionDay28,
      rawJson: values.raw,
      createdAt,
    }));

  const parts = [
    !vendorNumber
      ? "downloads skipped (ASC_VENDOR_NUMBER not set)"
      : salesReportsAvailable
        ? "downloads via Sales Reports"
        : salesReportError
          ? `downloads unavailable (${salesReportError})`
          : "no Sales Reports data yet for this range",
    analyticsNote ?? "retention via Analytics Reports",
  ];

  return {
    result: {
      source: "asc_analytics",
      projectId: project.id,
      status: "success",
      message: `Imported App Store Connect analytics for ${metrics.length} day(s) between ${startDate} and ${endDate} (${parts.join("; ")}).`,
      inserted: { snapshots: metrics.length, queries: 0, pages: 0 },
    },
    metrics,
  };
}

async function attachSessionsRetention(
  reportId: string,
  startDate: string,
  endDate: string,
  byDate: Map<string, { downloads?: number; retentionDay1?: number; retentionDay7?: number; retentionDay28?: number; raw: Record<string, unknown> }>,
): Promise<void> {
  const instance = await latestInstance(reportId);
  if (!instance) return;

  const rows = await downloadSegments(instance.id);
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const dateCol = findColumn(headers, "date");
  const day1Col = findColumn(headers, "day 1", "day1");
  const day7Col = findColumn(headers, "day 7", "day7");
  const day28Col = findColumn(headers, "day 28", "day28");

  for (const row of rows) {
    const date = dateCol ? row[dateCol] : undefined;
    if (!date || date < startDate || date > endDate) continue;
    const entry = byDate.get(date) ?? { raw: {} };
    if (day1Col) entry.retentionDay1 = Number(row[day1Col]);
    if (day7Col) entry.retentionDay7 = Number(row[day7Col]);
    if (day28Col) entry.retentionDay28 = Number(row[day28Col]);
    entry.raw.sessionsRow = row;
    byDate.set(date, entry);
  }
}

function skipped(projectId: string, message: string) {
  return {
    result: {
      source: "asc_analytics" as const,
      projectId,
      status: "skipped" as const,
      message,
      inserted: { snapshots: 0, queries: 0, pages: 0 },
    },
    metrics: [] as AscAnalyticsMetric[],
  };
}
