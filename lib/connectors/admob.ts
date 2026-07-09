import { google, type admob_v1 } from "googleapis";
import { createId } from "@/lib/id";
import type { AdmobMediationMetric, MetricSnapshot, Project, SyncResult } from "@/lib/types";

type AdmobReportRow = {
  dimensionValues?: Record<string, { value?: string | null; displayLabel?: string | null }>;
  metricValues?: Record<string, { microsValue?: string | null; integerValue?: string | null; doubleValue?: number | null }>;
};

type AdmobReportEntry = {
  header?: { localizationSettings?: { currencyCode?: string | null } };
  row?: AdmobReportRow;
  footer?: unknown;
};

type AdmobClient = admob_v1.Admob;

export async function syncAdmobProject(project: Project, date: string): Promise<{
  result: SyncResult;
  snapshots: MetricSnapshot[];
  mediationMetrics: AdmobMediationMetric[];
}> {
  // A logical app can have separate AdMob app ids per platform (Android via admobAppId,
  // iOS via admobAppIdIos); both are summed into one snapshot for the project.
  const appIds = [project.admobAppId, project.admobAppIdIos].filter((id): id is string => Boolean(id));
  if (appIds.length === 0) {
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
  const createdAt = new Date().toISOString();

  const networkResponse = await admob.accounts.networkReport.generate({
    parent: `accounts/${publisherId}`,
    requestBody: {
      reportSpec: {
        dateRange: { startDate: day, endDate: day },
        dimensions: ["DATE", "APP"],
        metrics: ["ESTIMATED_EARNINGS", "IMPRESSIONS", "CLICKS", "AD_REQUESTS"],
        dimensionFilters: [{ dimension: "APP", matchesAny: { values: appIds } }],
      },
    },
  });

  const networkEntries = toEntries(networkResponse.data);
  const currency = networkEntries.find((entry) => entry.header)?.header?.localizationSettings?.currencyCode ?? undefined;
  const networkRows = networkEntries
    .map((entry) => entry.row)
    .filter((row): row is AdmobReportRow => Boolean(row));

  const mediationMetrics = await fetchMediationMetrics(admob, publisherId, project.id, appIds, day, date, createdAt);

  if (networkRows.length === 0) {
    return {
      result: {
        source: "admob",
        projectId: project.id,
        status: "success",
        message: `No AdMob network data for ${appIds.join(", ")} on ${date}.`,
        inserted: { snapshots: 0, queries: 0, pages: 0 },
      },
      snapshots: [],
      mediationMetrics,
    };
  }

  const totals = networkRows.reduce(
    (acc, row) => {
      const metrics = row.metricValues ?? {};
      acc.revenue += microsToAmount(metrics.ESTIMATED_EARNINGS?.microsValue);
      acc.impressions += toNumber(metrics.IMPRESSIONS?.integerValue);
      acc.clicks += toNumber(metrics.CLICKS?.integerValue);
      acc.adRequests += toNumber(metrics.AD_REQUESTS?.integerValue);
      return acc;
    },
    { revenue: 0, impressions: 0, clicks: 0, adRequests: 0 },
  );

  return {
    result: {
      source: "admob",
      projectId: project.id,
      status: "success",
      message: `Imported AdMob network report for ${date} (${networkRows.length} app${networkRows.length > 1 ? "s" : ""}).`,
      inserted: { snapshots: 1, queries: 0, pages: 0 },
    },
    snapshots: [
      {
        id: createId("metric"),
        projectId: project.id,
        source: "admob",
        date,
        revenue: totals.revenue,
        impressions: totals.impressions,
        clicks: totals.clicks,
        adRequests: totals.adRequests,
        currency,
        rawJson: networkRows,
        createdAt,
      },
    ],
    mediationMetrics,
  };
}

// Mediation report breaks the same AdMob apps down by ad source (AdMob Network, AppLovin,
// Meta, etc.) and format, so we can see which mediated network actually drives revenue.
async function fetchMediationMetrics(
  admob: AdmobClient,
  publisherId: string,
  projectId: string,
  appIds: string[],
  day: { year: number; month: number; day: number },
  date: string,
  createdAt: string,
): Promise<AdmobMediationMetric[]> {
  const response = await admob.accounts.mediationReport.generate({
    parent: `accounts/${publisherId}`,
    requestBody: {
      reportSpec: {
        dateRange: { startDate: day, endDate: day },
        dimensions: ["DATE", "APP", "AD_SOURCE", "FORMAT"],
        metrics: ["AD_REQUESTS", "MATCHED_REQUESTS", "IMPRESSIONS", "CLICKS", "ESTIMATED_EARNINGS", "OBSERVED_ECPM"],
        dimensionFilters: [{ dimension: "APP", matchesAny: { values: appIds } }],
      },
    },
  });

  const entries = toEntries(response.data);
  const currency = entries.find((entry) => entry.header)?.header?.localizationSettings?.currencyCode ?? undefined;
  const rows = entries.map((entry) => entry.row).filter((row): row is AdmobReportRow => Boolean(row));

  type Aggregate = {
    adSourceId?: string;
    adSourceName: string;
    format?: string;
    adRequests: number;
    matchedRequests: number;
    impressions: number;
    clicks: number;
    estimatedEarnings: number;
    ecpmSum: number;
    ecpmCount: number;
    rawRows: AdmobReportRow[];
  };

  const byKey = new Map<string, Aggregate>();

  for (const row of rows) {
    const dims = row.dimensionValues ?? {};
    const adSourceId = dims.AD_SOURCE?.value ?? undefined;
    const adSourceName = dims.AD_SOURCE?.displayLabel ?? adSourceId ?? "Unknown";
    const format = dims.FORMAT?.displayLabel ?? dims.FORMAT?.value ?? undefined;
    const key = `${adSourceId ?? adSourceName}::${format ?? ""}`;

    const metrics = row.metricValues ?? {};
    const aggregate = byKey.get(key) ?? {
      adSourceId,
      adSourceName,
      format,
      adRequests: 0,
      matchedRequests: 0,
      impressions: 0,
      clicks: 0,
      estimatedEarnings: 0,
      ecpmSum: 0,
      ecpmCount: 0,
      rawRows: [],
    };

    aggregate.adRequests += toNumber(metrics.AD_REQUESTS?.integerValue);
    aggregate.matchedRequests += toNumber(metrics.MATCHED_REQUESTS?.integerValue);
    aggregate.impressions += toNumber(metrics.IMPRESSIONS?.integerValue);
    aggregate.clicks += toNumber(metrics.CLICKS?.integerValue);
    aggregate.estimatedEarnings += microsToAmount(metrics.ESTIMATED_EARNINGS?.microsValue);
    const ecpmMicros = metrics.OBSERVED_ECPM?.microsValue;
    if (ecpmMicros) {
      aggregate.ecpmSum += Number(ecpmMicros) / 1_000_000;
      aggregate.ecpmCount += 1;
    }
    aggregate.rawRows.push(row);
    byKey.set(key, aggregate);
  }

  return [...byKey.values()].map((aggregate) => ({
    id: createId("admobmediation"),
    projectId,
    date,
    adSourceId: aggregate.adSourceId,
    adSourceName: aggregate.adSourceName,
    format: aggregate.format,
    adRequests: aggregate.adRequests,
    matchedRequests: aggregate.matchedRequests,
    matchRate: aggregate.adRequests > 0 ? aggregate.matchedRequests / aggregate.adRequests : undefined,
    impressions: aggregate.impressions,
    clicks: aggregate.clicks,
    estimatedEarnings: aggregate.estimatedEarnings,
    observedEcpm: aggregate.ecpmCount > 0 ? aggregate.ecpmSum / aggregate.ecpmCount : undefined,
    currency,
    rawJson: aggregate.rawRows,
    createdAt,
  }));
}

// The AdMob API streams [{header}, {row}, ..., {footer}]; the googleapis client
// returns that sequence as the response body even though its types model a single object.
function toEntries(data: unknown): AdmobReportEntry[] {
  return (Array.isArray(data) ? data : [data]) as AdmobReportEntry[];
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
    mediationMetrics: [] as AdmobMediationMetric[],
  };
}
