import { createId } from "@/lib/id";
import type { MetricSnapshot, Project, SyncResult } from "@/lib/types";

type RevenueCatOverviewMetrics = {
  currency?: string;
  metrics?: Array<{ id: string; value: number | null }>;
};

function metricValue(
  payload: RevenueCatOverviewMetrics,
  id: string,
): number {
  return payload.metrics?.find((m) => m.id === id)?.value ?? 0;
}

export async function syncRevenueCatProject(project: Project, date: string): Promise<{
  result: SyncResult;
  snapshots: MetricSnapshot[];
}> {
  if (!project.revenueCatProjectId) {
    return skipped(project.id, "Project has no RevenueCat project id.");
  }

  const apiKey = process.env.REVENUECAT_API_KEY;
  if (!apiKey) {
    return skipped(project.id, "REVENUECAT_API_KEY is not configured.");
  }

  const url = `https://api.revenuecat.com/v2/projects/${project.revenueCatProjectId}/metrics/overview`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`RevenueCat request failed for ${project.name}: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as RevenueCatOverviewMetrics;
  const createdAt = new Date().toISOString();

  return {
    result: {
      source: "revenuecat",
      projectId: project.id,
      status: "success",
      message: `Imported RevenueCat overview metrics (snapshot ${date}).`,
      inserted: { snapshots: 1, queries: 0, pages: 0 },
    },
    snapshots: [
      {
        id: createId("metric"),
        projectId: project.id,
        source: "revenuecat",
        date,
        revenue: metricValue(payload, "revenue"),
        mrr: metricValue(payload, "mrr"),
        activeSubscribers: metricValue(payload, "active_subscriptions"),
        activeTrials: metricValue(payload, "active_trials"),
        newCustomers: metricValue(payload, "new_customers"),
        currency: payload.currency,
        rawJson: payload,
        createdAt,
      },
    ],
  };
}

function skipped(projectId: string, message: string) {
  return {
    result: {
      source: "revenuecat" as const,
      projectId,
      status: "skipped" as const,
      message,
      inserted: { snapshots: 0, queries: 0, pages: 0 },
    },
    snapshots: [] as MetricSnapshot[],
  };
}
