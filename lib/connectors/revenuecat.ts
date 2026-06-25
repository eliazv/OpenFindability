import { createId } from "@/lib/id";
import type { MetricSnapshot, Project, SyncResult } from "@/lib/types";

type RevenueCatOverviewMetrics = {
  active_trials?: number;
  active_subscriptions?: number;
  mrr?: number;
  revenue_last_28_days?: number;
  new_customers_last_28_days?: number;
  active_users_last_28_days?: number;
};

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
        revenue: payload.revenue_last_28_days ?? 0,
        mrr: payload.mrr ?? 0,
        activeSubscribers: payload.active_subscriptions ?? 0,
        activeTrials: payload.active_trials ?? 0,
        newCustomers: payload.new_customers_last_28_days ?? 0,
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
