import { createId } from "@/lib/id";
import type { AppData, Opportunity } from "@/lib/types";

export function buildOpportunities(data: AppData): Opportunity[] {
  const detectedAt = new Date().toISOString();
  const opportunities: Opportunity[] = [];

  for (const query of data.searchQueries) {
    if (query.impressions >= 1000 && query.ctr < 0.012) {
      opportunities.push({
        id: createId("opp"),
        projectId: query.projectId,
        type: "low_ctr_query",
        title: `CTR basso per "${query.query}"`,
        description: `${query.impressions.toLocaleString("it-IT")} impression, ${query.clicks} click e CTR ${(query.ctr * 100).toFixed(1)}%. Migliora title, meta description o intento della pagina.`,
        severity: query.impressions >= 3000 ? "high" : "medium",
        score: Math.round(query.impressions * (0.02 - query.ctr)),
        status: "open",
        detectedAt,
        rawJson: query,
      });
    }

    if (query.avgPosition >= 5 && query.avgPosition <= 15 && query.impressions >= 500) {
      opportunities.push({
        id: createId("opp"),
        projectId: query.projectId,
        type: "striking_distance_query",
        title: `Query vicina alla prima pagina: "${query.query}"`,
        description: `Posizione media ${query.avgPosition.toFixed(1)} con ${query.impressions.toLocaleString("it-IT")} impression. Potrebbe bastare aggiornare contenuto, heading e linking interno.`,
        severity: query.avgPosition <= 10 ? "high" : "medium",
        score: Math.round(query.impressions / Math.max(query.avgPosition, 1)),
        status: "open",
        detectedAt,
        rawJson: query,
      });
    }
  }

  for (const page of data.pageMetrics) {
    if (page.impressions >= 3000 && page.ctr < 0.01) {
      opportunities.push({
        id: createId("opp"),
        projectId: page.projectId,
        type: "declining_page",
        title: `Pagina con visibilita' ma pochi click: ${page.page}`,
        description: `${page.impressions.toLocaleString("it-IT")} impression e CTR ${(page.ctr * 100).toFixed(1)}%. Controlla snippet, search intent e copertura query.`,
        severity: "medium",
        score: Math.round(page.impressions * (0.015 - page.ctr)),
        status: "open",
        detectedAt,
        rawJson: page,
      });
    }
  }

  return opportunities.sort((a, b) => b.score - a.score).slice(0, 50);
}

export function summarizeProject(data: AppData, projectId: string) {
  const snapshots = data.metricSnapshots.filter((metric) => metric.projectId === projectId);
  const gsc = snapshots.filter((metric) => metric.source === "gsc");
  const umami = snapshots.filter((metric) => metric.source === "umami");
  const opportunities = data.opportunities.filter((opportunity) => opportunity.projectId === projectId);

  return {
    clicks: sum(gsc, "clicks"),
    impressions: sum(gsc, "impressions"),
    visitors: sum(umami, "visitors"),
    pageviews: sum(umami, "pageviews"),
    opportunities: opportunities.length,
    highPriority: opportunities.filter((opportunity) => opportunity.severity === "high").length,
  };
}

function sum<T extends Record<string, unknown>>(items: T[], key: keyof T): number {
  return items.reduce((total, item) => total + Number(item[key] ?? 0), 0);
}
