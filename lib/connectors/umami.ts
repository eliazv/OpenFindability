import { createId } from "@/lib/id";
import type { MetricSnapshot, Project, SyncResult } from "@/lib/types";

type UmamiStatsResponse = {
  pageviews?: { value?: number };
  visitors?: { value?: number };
  visits?: { value?: number };
  views?: { value?: number };
};

export async function syncUmamiProject(project: Project, date: string): Promise<{
  result: SyncResult;
  snapshots: MetricSnapshot[];
}> {
  if (!project.umamiWebsiteId) {
    return skipped(project.id, "Project has no Umami website ID.");
  }

  const apiKey = process.env.UMAMI_API_KEY;
  const baseUrl = process.env.UMAMI_BASE_URL ?? "https://cloud.umami.is";

  if (!apiKey) {
    return skipped(project.id, "UMAMI_API_KEY is not configured.");
  }

  const startAt = new Date(`${date}T00:00:00.000Z`).getTime();
  const endAt = new Date(`${date}T23:59:59.999Z`).getTime();
  const url = new URL(`/api/websites/${project.umamiWebsiteId}/stats`, baseUrl);
  url.searchParams.set("startAt", String(startAt));
  url.searchParams.set("endAt", String(endAt));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-umami-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Umami request failed for ${project.name}: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as UmamiStatsResponse;
  const visitors = payload.visitors?.value ?? payload.visits?.value ?? 0;
  const pageviews = payload.pageviews?.value ?? payload.views?.value ?? 0;
  const createdAt = new Date().toISOString();

  return {
    result: {
      source: "umami",
      projectId: project.id,
      status: "success",
      message: `Imported Umami stats for ${date}.`,
      inserted: { snapshots: 1, queries: 0, pages: 0 },
    },
    snapshots: [
      {
        id: createId("metric"),
        projectId: project.id,
        source: "umami",
        date,
        visitors,
        pageviews,
        rawJson: payload,
        createdAt,
      },
    ],
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
