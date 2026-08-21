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

  let requestId: string;
  try {
    requestId = await ensureOngoingAnalyticsRequest(appId);
  } catch (error) {
    return skipped(
      project.id,
      `Could not create/find an ONGOING analytics report request (first request needs an Admin-role API key): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const reports = await listReportsForRequest(requestId);
  const downloadsReport = reports.find((r) => /download/i.test(r.name));
  const sessionsReport = reports.find((r) => /session|retention|engagement/i.test(r.name));

  if (!downloadsReport && !sessionsReport) {
    return {
      result: {
        source: "asc_analytics",
        projectId: project.id,
        status: "success",
        message: `Analytics report request ${requestId} exists but no downloads/sessions report is available yet (Apple generates the first instance 24-48h after the request is created).`,
        inserted: { snapshots: 0, queries: 0, pages: 0 },
      },
      metrics: [],
    };
  }

  const byDate = new Map<string, { downloads?: number; retentionDay1?: number; retentionDay7?: number; retentionDay28?: number; raw: Record<string, unknown> }>();
  let anyInstanceFound = false;

  if (downloadsReport) {
    const instance = await latestInstance(downloadsReport.id);
    if (instance) {
      anyInstanceFound = true;
      const rows = await downloadSegments(instance.id);
      if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        const dateCol = findColumn(headers, "date");
        const countCol = findColumn(headers, "counts", "units", "total downloads");
        for (const row of rows) {
          const date = dateCol ? row[dateCol] : undefined;
          if (!date || date < startDate || date > endDate) continue;
          const entry = byDate.get(date) ?? { raw: {} };
          const value = countCol ? Number(row[countCol]) : undefined;
          entry.downloads = (entry.downloads ?? 0) + (value ?? 0);
          entry.raw.downloadsRow = row;
          byDate.set(date, entry);
        }
      }
    }
  }

  if (sessionsReport) {
    const instance = await latestInstance(sessionsReport.id);
    if (instance) {
      anyInstanceFound = true;
      const rows = await downloadSegments(instance.id);
      if (rows.length > 0) {
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
    }
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

  const message = !anyInstanceFound
    ? `Report request ${requestId} exists but Apple hasn't generated a report instance yet (first instance typically appears 24-48h after the request was created).`
    : `Imported App Store Connect analytics for ${metrics.length} day(s) between ${startDate} and ${endDate}.`;

  return {
    result: {
      source: "asc_analytics",
      projectId: project.id,
      status: "success",
      message,
      inserted: { snapshots: metrics.length, queries: 0, pages: 0 },
    },
    metrics,
  };
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
