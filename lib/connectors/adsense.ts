import { google } from "googleapis";
import { createId } from "@/lib/id";
import type { MetricSnapshot, Project, SyncResult } from "@/lib/types";

const DIMENSIONS = ["DATE"];
const METRICS = ["ESTIMATED_EARNINGS", "PAGE_VIEWS", "IMPRESSIONS", "CLICKS", "AD_REQUESTS"];

export async function syncAdsenseProject(project: Project, startDate: string, endDate: string): Promise<{
  result: SyncResult;
  snapshots: MetricSnapshot[];
}> {
  if (!project.adsenseSiteDomain) {
    return skipped(project.id, "Project has no AdSense site domain configured.");
  }

  const auth = getAdsenseAuth();
  const accountId = process.env.ADSENSE_ACCOUNT_ID?.trim();
  if (!auth || !accountId) {
    return skipped(
      project.id,
      "ADSENSE_CLIENT_ID, ADSENSE_CLIENT_SECRET, ADSENSE_REFRESH_TOKEN and ADSENSE_ACCOUNT_ID are not fully configured.",
    );
  }

  const adsense = google.adsense({ version: "v2", auth });
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const createdAt = new Date().toISOString();

  const response = await adsense.accounts.reports.generate({
    account: `accounts/${accountId}`,
    dimensions: DIMENSIONS,
    metrics: METRICS,
    filters: [`OWNED_SITE_DOMAIN_NAME==${project.adsenseSiteDomain}`],
    "startDate.year": start.year,
    "startDate.month": start.month,
    "startDate.day": start.day,
    "endDate.year": end.year,
    "endDate.month": end.month,
    "endDate.day": end.day,
  });

  const headers = response.data.headers ?? [];
  const rows = response.data.rows ?? [];
  const dateIndex = headers.findIndex((h) => h.name === "DATE");
  const metricIndex = Object.fromEntries(METRICS.map((m) => [m, headers.findIndex((h) => h.name === m)]));
  const currency = headers.find((h) => h.type === "METRIC_CURRENCY")?.currencyCode ?? undefined;

  if (rows.length === 0) {
    return {
      result: {
        source: "adsense",
        projectId: project.id,
        status: "success",
        message: `No AdSense data for ${project.adsenseSiteDomain} between ${startDate} and ${endDate}.`,
        inserted: { snapshots: 0, queries: 0, pages: 0 },
      },
      snapshots: [],
    };
  }

  const snapshots: MetricSnapshot[] = rows
    .map((row): MetricSnapshot | null => {
      const cells = row.cells ?? [];
      const date = dateIndex >= 0 ? cells[dateIndex]?.value : undefined;
      if (!date) return null;
      return {
        id: createId("metric"),
        projectId: project.id,
        source: "adsense",
        date,
        revenue: toNumber(cells[metricIndex.ESTIMATED_EARNINGS]?.value),
        pageviews: toNumber(cells[metricIndex.PAGE_VIEWS]?.value),
        impressions: toNumber(cells[metricIndex.IMPRESSIONS]?.value),
        clicks: toNumber(cells[metricIndex.CLICKS]?.value),
        adRequests: toNumber(cells[metricIndex.AD_REQUESTS]?.value),
        currency,
        rawJson: row,
        createdAt,
      };
    })
    .filter((s): s is MetricSnapshot => s !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    result: {
      source: "adsense",
      projectId: project.id,
      status: "success",
      message: `Imported AdSense report for ${snapshots.length} day(s) between ${startDate} and ${endDate}.`,
      inserted: { snapshots: snapshots.length, queries: 0, pages: 0 },
    },
    snapshots,
  };
}

function getAdsenseAuth() {
  const clientId = process.env.ADSENSE_CLIENT_ID?.trim();
  const clientSecret = process.env.ADSENSE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ADSENSE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

function parseDateKey(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function toNumber(value?: string | null): number {
  return value ? Number(value) : 0;
}

function skipped(projectId: string, message: string) {
  return {
    result: {
      source: "adsense" as const,
      projectId,
      status: "skipped" as const,
      message,
      inserted: { snapshots: 0, queries: 0, pages: 0 },
    },
    snapshots: [] as MetricSnapshot[],
  };
}
