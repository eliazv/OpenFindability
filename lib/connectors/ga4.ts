import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import { createId } from "@/lib/id";
import type { MetricSnapshot, Project, SyncResult } from "@/lib/types";

export type Ga4RunReportResponse = {
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  rowCount?: number;
  metadata?: { timeZone?: string; currencyCode?: string };
};

export function normalizeGa4Days(
  projectId: string,
  payload: Ga4RunReportResponse,
  createdAt: string,
): MetricSnapshot[] {
  const rows = payload.rows ?? [];
  if (payload.rowCount !== undefined && payload.rowCount !== rows.length) {
    throw new Error(`GA4 report incomplete: returned ${rows.length} of ${payload.rowCount} rows.`);
  }
  return rows.map((row) => {
    const date = row.dimensionValues?.[0]?.value ?? "";
    if (!/^\d{8}$/.test(date)) throw new Error("GA4 returned an invalid YYYYMMDD date.");
    const dateKey = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const validDate = new Date(dateKey + "T00:00:00Z");
    if (Number.isNaN(validDate.getTime()) || validDate.toISOString().slice(0, 10) !== dateKey) {
      throw new Error("GA4 returned an invalid date.");
    }
    const parseMetric = (index: number): number => {
      const raw = row.metricValues?.[index]?.value;
      if (raw === undefined || raw.trim() === "") throw new Error(`GA4 returned a missing metric at ${dateKey}.`);
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(value)) {
        throw new Error(`GA4 returned an invalid metric at ${dateKey}.`);
      }
      return value;
    };
    const activeUsers = parseMetric(0);
    const sessions = parseMetric(1);
    const views = parseMetric(2);
    const keyEvents = parseMetric(3);
    return {
      id: createId("metric"),
      projectId,
      source: "ga4" as const,
      date: dateKey,
      // GA4 Active Users ≠ Umami visitors; keep provider separate in reports.
      visitors: activeUsers,
      pageviews: views,
      rawJson: {
        activeUsers, sessions, screenPageViews: views, keyEvents,
        ga4TimeZone: payload.metadata?.timeZone ?? null,
        grain: "daily",
      },
      createdAt,
    };
  });
}

export async function syncGa4Project(
  project: Project, startDate: string, endDate: string,
): Promise<{ result: SyncResult; snapshots: MetricSnapshot[] }> {
  const source = "ga4" as const;
  const inserted = { snapshots: 0, queries: 0, pages: 0 };
  const skipped = (message: string) => ({
    result: { source, projectId: project.id, status: "skipped" as const, message, inserted },
    snapshots: [] as MetricSnapshot[],
  });
  if (!project.ga4PropertyId) return skipped("No GA4 property ID for this project.");
  const property = project.ga4PropertyId.replace(/^properties\//, "");
  if (!/^\d+$/.test(property)) throw new Error("GA4 property ID must be numeric.");

  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!json && !file) return skipped("Configure GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE.");
  const credentials = JSON.parse(json || await readFile(file as string, "utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Cannot obtain GA4 Analytics read-only access token.");

  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "activeUsers" }, { name: "sessions" },
        { name: "screenPageViews" }, { name: "keyEvents" },
      ],
      limit: 100000,
    }),
  });
  if (!response.ok) {
    throw new Error(`GA4 runReport failed for ${project.slug}: HTTP ${response.status}`);
  }
  const payload = await response.json() as Ga4RunReportResponse;
  const snapshots = normalizeGa4Days(project.id, payload, new Date().toISOString());
  return {
    result: {
      source, projectId: project.id,
      status: snapshots.length ? "success" : "no_data",
      message: `GA4 active users, sessions, page views and key events: ${snapshots.length} day(s) between ${startDate} and ${endDate}.`,
      inserted: { snapshots: snapshots.length, queries: 0, pages: 0 },
    },
    snapshots,
  };
}
