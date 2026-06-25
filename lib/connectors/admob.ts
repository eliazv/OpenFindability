import { google } from "googleapis";
import { createId } from "@/lib/id";
import type { MetricSnapshot, Project, SyncResult } from "@/lib/types";

type AdmobReportRow = {
  dimensionValues?: Record<string, { value?: string | null; displayLabel?: string | null }>;
  metricValues?: Record<string, { microsValue?: string | null; integerValue?: string | null; doubleValue?: number | null }>;
};

type AdmobReportEntry = {
  header?: { localizationSettings?: { currencyCode?: string | null } };
  row?: AdmobReportRow;
  footer?: unknown;
};

export async function syncAdmobProject(project: Project, date: string): Promise<{
  result: SyncResult;
  snapshots: MetricSnapshot[];
}> {
  if (!project.admobAppId) {
    return skipped(project.id, "Project has no AdMob app id.");
  }

  const auth = getAdmobAuth();
  const publisherId = process.env.ADMOB_PUBLISHER_ID?.trim();
  if (!auth || !publisherId) {
    return skipped(
      project.id,
      "ADMOB_CLIENT_ID, ADMOB_CLIENT_SECRET, ADMOB_REFRESH_TOKEN and ADMOB_PUBLISHER_ID are not fully configured.",
    );
  }

  const admob = google.admob({ version: "v1", auth });
  const day = parseDateKey(date);

  const response = await admob.accounts.networkReport.generate({
    parent: `accounts/${publisherId}`,
    requestBody: {
      reportSpec: {
        dateRange: { startDate: day, endDate: day },
        dimensions: ["DATE", "APP"],
        metrics: ["ESTIMATED_EARNINGS", "IMPRESSIONS", "CLICKS", "AD_REQUESTS"],
      },
    },
  });

  // The AdMob API streams [{header}, {row}, ..., {footer}]; the googleapis client
  // returns that sequence as the response body even though its types model a single object.
  const entries = (Array.isArray(response.data) ? response.data : [response.data]) as AdmobReportEntry[];
  const currency = entries.find((entry) => entry.header)?.header?.localizationSettings?.currencyCode ?? undefined;
  const row = entries.find((entry) => entry.row?.dimensionValues?.APP?.value === project.admobAppId)?.row;
  const createdAt = new Date().toISOString();

  if (!row) {
    return {
      result: {
        source: "admob",
        projectId: project.id,
        status: "success",
        message: `No AdMob network data for ${project.admobAppId} on ${date}.`,
        inserted: { snapshots: 0, queries: 0, pages: 0 },
      },
      snapshots: [],
    };
  }

  const metrics = row.metricValues ?? {};

  return {
    result: {
      source: "admob",
      projectId: project.id,
      status: "success",
      message: `Imported AdMob network report for ${date}.`,
      inserted: { snapshots: 1, queries: 0, pages: 0 },
    },
    snapshots: [
      {
        id: createId("metric"),
        projectId: project.id,
        source: "admob",
        date,
        revenue: microsToAmount(metrics.ESTIMATED_EARNINGS?.microsValue),
        impressions: toNumber(metrics.IMPRESSIONS?.integerValue),
        clicks: toNumber(metrics.CLICKS?.integerValue),
        adRequests: toNumber(metrics.AD_REQUESTS?.integerValue),
        currency,
        rawJson: row,
        createdAt,
      },
    ],
  };
}

function getAdmobAuth() {
  const clientId = process.env.ADMOB_CLIENT_ID?.trim();
  const clientSecret = process.env.ADMOB_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ADMOB_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

function parseDateKey(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function microsToAmount(micros?: string | null): number {
  return micros ? Number(micros) / 1_000_000 : 0;
}

function toNumber(value?: string | null): number {
  return value ? Number(value) : 0;
}

function skipped(projectId: string, message: string) {
  return {
    result: {
      source: "admob" as const,
      projectId,
      status: "skipped" as const,
      message,
      inserted: { snapshots: 0, queries: 0, pages: 0 },
    },
    snapshots: [] as MetricSnapshot[],
  };
}
