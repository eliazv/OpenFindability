import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import { createId } from "@/lib/id";
import type { PlayVitalsMetric, Project, SyncResult } from "@/lib/types";

const PLAY_VITALS_SCOPE = "https://www.googleapis.com/auth/playdeveloperreporting";

export type PlayVitalsApp = { packageName: string; name?: string };

async function getPlayVitalsAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!json && !file) return null;

  const credentials = JSON.parse(json || (await readFile(file as string, "utf8")));
  return new google.auth.GoogleAuth({ credentials, scopes: [PLAY_VITALS_SCOPE] });
}

// Account-wide discovery: unlike androidpublisher (no apps.list), the Play Developer
// Reporting API exposes apps:search for every app visible to this service account.
export async function listPlayVitalsApps(): Promise<PlayVitalsApp[]> {
  const auth = await getPlayVitalsAuth();
  if (!auth) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE is not configured.");
  const reporting = google.playdeveloperreporting({ version: "v1beta1", auth });

  const apps: PlayVitalsApp[] = [];
  let pageToken: string | undefined;
  do {
    const response = await reporting.apps.search({ pageSize: 1000, ...(pageToken && { pageToken }) });
    for (const app of response.data.apps ?? []) {
      if (app.packageName) apps.push({ packageName: app.packageName, name: app.displayName ?? undefined });
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return apps;
}

// crashrate.query/anrrate.query return one row per (date, dimension-combo); we ask for the
// PACKAGE_NAME-less per-app "total" freshness aggregate by not slicing on any dimension,
// which yields exactly one row per day.
async function queryVitalsMetric(
  reporting: ReturnType<typeof google.playdeveloperreporting>,
  packageName: string,
  metricSet: "vitals.crashrate" | "vitals.anrrate",
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const byDate = new Map<string, number>();

  const metricName = metricSet === "vitals.crashrate" ? "userPerceivedCrashRate" : "userPerceivedAnrRate";
  const resource =
    metricSet === "vitals.crashrate" ? reporting.vitals.crashrate : reporting.vitals.anrrate;
  const resourceSuffix = metricSet === "vitals.crashrate" ? "crashRateMetricSet" : "anrRateMetricSet";

  let pageToken: string | undefined;
  do {
    const response = await resource.query({
      name: `apps/${packageName}/${resourceSuffix}`,
      requestBody: {
        timelineSpec: {
          aggregationPeriod: "DAILY",
          startTime: { year: start.year, month: start.month, day: start.day },
          endTime: { year: end.year, month: end.month, day: end.day },
        },
        metrics: [metricName],
        pageSize: 1000,
        ...(pageToken && { pageToken }),
      },
    });

    for (const row of response.data.rows ?? []) {
      const dateValue = row.startTime;
      if (!dateValue?.year || !dateValue.month || !dateValue.day) continue;
      const date = formatDateKey(dateValue.year, dateValue.month, dateValue.day);
      const metric = row.metrics?.find((m) => m.metric === metricName);
      const value = metric?.decimalValue?.value ? Number(metric.decimalValue.value) : undefined;
      if (value !== undefined) byDate.set(date, value);
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return byDate;
}

export async function syncPlayVitalsProject(
  project: Project,
  startDate: string,
  endDate: string,
): Promise<{ result: SyncResult; metrics: PlayVitalsMetric[] }> {
  if (!project.playConsolePackageName) {
    return skipped(project.id, "Project has no Play Console package name.");
  }

  const auth = await getPlayVitalsAuth();
  if (!auth) {
    return skipped(project.id, "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE is not configured.");
  }

  const packageName = project.playConsolePackageName;
  const reporting = google.playdeveloperreporting({ version: "v1beta1", auth });
  const createdAt = new Date().toISOString();

  const [crashByDate, anrByDate] = await Promise.all([
    queryVitalsMetric(reporting, packageName, "vitals.crashrate", startDate, endDate),
    queryVitalsMetric(reporting, packageName, "vitals.anrrate", startDate, endDate),
  ]);

  const dates = new Set([...crashByDate.keys(), ...anrByDate.keys()]);
  const metrics: PlayVitalsMetric[] = [...dates]
    .sort()
    .map((date) => ({
      id: createId("playvitals"),
      projectId: project.id,
      date,
      crashRate: crashByDate.get(date),
      anrRate: anrByDate.get(date),
      rawJson: { crash: crashByDate.get(date), anr: anrByDate.get(date) },
      createdAt,
    }));

  return {
    result: {
      source: "play_vitals",
      projectId: project.id,
      status: "success",
      message: `Imported Play vitals (crash/ANR rate) for ${metrics.length} day(s) between ${startDate} and ${endDate}.`,
      inserted: { snapshots: metrics.length, queries: 0, pages: 0 },
    },
    metrics,
  };
}

function parseDateKey(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function skipped(projectId: string, message: string) {
  return {
    result: {
      source: "play_vitals" as const,
      projectId,
      status: "skipped" as const,
      message,
      inserted: { snapshots: 0, queries: 0, pages: 0 },
    },
    metrics: [] as PlayVitalsMetric[],
  };
}
