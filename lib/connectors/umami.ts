import { createId } from "@/lib/id";
import type { MetricSnapshot, Project, SyncResult } from "@/lib/types";

// Umami Cloud / v2 wrap each metric as { value, prev }; self-hosted v3 returns plain numbers.
type UmamiMetric = number | { value?: number };
type UmamiStatsResponse = {
  pageviews?: UmamiMetric;
  visitors?: UmamiMetric;
  visits?: UmamiMetric;
  views?: UmamiMetric;
};

export function readUmamiMetric(metric: UmamiMetric | undefined): number | undefined {
  if (typeof metric === "number") return metric;
  return typeof metric?.value === "number" ? metric.value : undefined;
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// One stats call per day: Umami only returns unique visitors for the window it is asked about,
// so daily visitors cannot be derived from a single range request.
export async function syncUmamiProject(project: Project, startDate: string, endDate: string = startDate): Promise<{
  result: SyncResult;
  snapshots: MetricSnapshot[];
}> {
  if (!project.umamiWebsiteId) {
    return skipped(project.id, "Project has no Umami website ID.");
  }

  const apiKey = process.env.UMAMI_API_KEY;
  const baseUrl = process.env.UMAMI_BASE_URL ?? "https://api.umami.is/v1";

  if (!apiKey) {
    return skipped(project.id, "UMAMI_API_KEY is not configured.");
  }

  const isCloud = new URL(baseUrl).hostname.endsWith("umami.is");
  const createdAt = new Date().toISOString();
  const snapshots: MetricSnapshot[] = [];

  for (const date of enumerateDates(startDate, endDate)) {
    const url = buildUmamiUrl(baseUrl, `/websites/${project.umamiWebsiteId}/stats`);
    url.searchParams.set("startAt", String(new Date(`${date}T00:00:00.000Z`).getTime()));
    url.searchParams.set("endAt", String(new Date(`${date}T23:59:59.999Z`).getTime()));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(isCloud ? { "x-umami-api-key": apiKey } : { Authorization: `Bearer ${apiKey}` }),
      },
    });

    if (!response.ok) {
      throw new Error(`Umami request failed for ${project.name}: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as UmamiStatsResponse;
    snapshots.push({
      id: createId("metric"),
      projectId: project.id,
      source: "umami",
      date,
      visitors: readUmamiMetric(payload.visitors) ?? readUmamiMetric(payload.visits) ?? 0,
      pageviews: readUmamiMetric(payload.pageviews) ?? readUmamiMetric(payload.views) ?? 0,
      rawJson: payload,
      createdAt,
    });
  }

  return {
    result: {
      source: "umami",
      projectId: project.id,
      status: "success",
      message: `Imported Umami stats for ${snapshots.length} day(s) between ${startDate} and ${endDate}.`,
      inserted: { snapshots: snapshots.length, queries: 0, pages: 0 },
    },
    snapshots,
  };
}

function skipped(projectId: string, message: string) {
  return {
    result: {
      source: "umami" as const,
      projectId,
      status: "skipped" as const,
      message,
      inserted: { snapshots: 0, queries: 0, pages: 0 },
    },
    snapshots: [],
  };
}

function buildUmamiUrl(baseUrl: string, path: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  const prefix = normalized.endsWith("/v1") ? "" : "/api";
  return new URL(`${normalized}${prefix}${path}`);
}
