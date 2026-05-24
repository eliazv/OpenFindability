import { createId } from "@/lib/id";
import type { AppData, Opportunity } from "@/lib/types";

export function buildOpportunities(data: AppData): Opportunity[] {
  const detectedAt = new Date().toISOString();
  const opportunities: Opportunity[] = [];

  for (const query of data.searchQueries) {
    const ctrPercent = query.ctr * 100;
    const potentialClicks = computePotentialClicks(query.impressions, ctrPercent, query.avgPosition);

    if (query.impressions >= 1000 && query.ctr < 0.012) {
      opportunities.push({
        id: createId("opp"),
        projectId: query.projectId,
        type: "low_ctr_query",
        title: `CTR basso per "${query.query}"`,
        description: `${query.impressions.toLocaleString("it-IT")} impression, ${query.clicks} click e CTR ${(query.ctr * 100).toFixed(1)}%. Click potenziali stimati: ${potentialClicks.toLocaleString("it-IT")}. Migliora title, meta description o intento della pagina.`,
        severity: query.impressions >= 3000 ? "high" : "medium",
        score: Math.max(potentialClicks, Math.round(query.impressions * (0.02 - query.ctr))),
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

    if (query.clicks === 0 && query.impressions >= 80 && query.avgPosition <= 15) {
      opportunities.push({
        id: createId("opp"),
        projectId: query.projectId,
        type: "zero_click_query",
        title: `Query con impression ma zero click: "${query.query}"`,
        description: `${query.impressions.toLocaleString("it-IT")} impression, posizione media ${query.avgPosition.toFixed(1)} e nessun click. Controlla se la pagina risponde davvero all'intento.`,
        severity: query.impressions >= 300 ? "medium" : "low",
        score: Math.round(query.impressions / Math.max(query.avgPosition, 1)),
        status: "open",
        detectedAt,
        rawJson: query,
      });
    }

    if (query.avgPosition > 10 && query.avgPosition <= 20 && query.impressions >= 100) {
      opportunities.push({
        id: createId("opp"),
        projectId: query.projectId,
        type: "page_two_query",
        title: `Query in pagina 2: "${query.query}"`,
        description: `Posizione media ${query.avgPosition.toFixed(1)} con ${query.impressions.toLocaleString("it-IT")} impression. Valuta contenuto dedicato, aggiornamento pagina o linking interno.`,
        severity: query.impressions >= 500 ? "medium" : "low",
        score: Math.round(query.impressions / Math.max(query.avgPosition - 9, 1)),
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

  opportunities.push(...buildCannibalizationOpportunities(data, detectedAt));

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

function expectedCtrForPosition(position: number) {
  if (position <= 1.5) return 28;
  if (position <= 2.5) return 17;
  if (position <= 3.5) return 11;
  if (position <= 5) return 7;
  if (position <= 8) return 4;
  if (position <= 10) return 3;
  if (position <= 15) return 1.5;
  return 0.8;
}

function computePotentialClicks(impressions: number, actualCtrPercent: number, position: number) {
  const targetCtr = expectedCtrForPosition(position);
  const ctrGap = Math.max(0, targetCtr - actualCtrPercent);
  return Math.round((impressions * ctrGap) / 100);
}

function buildCannibalizationOpportunities(data: AppData, detectedAt: string): Opportunity[] {
  const byProjectAndQuery = new Map<string, typeof data.searchQueries>();

  for (const row of data.searchQueries) {
    if (!row.page || row.impressions < 60) continue;
    const key = `${row.projectId}::${row.query.toLowerCase().trim()}`;
    const current = byProjectAndQuery.get(key) ?? [];
    current.push(row);
    byProjectAndQuery.set(key, current);
  }

  const opportunities: Opportunity[] = [];

  for (const rows of byProjectAndQuery.values()) {
    const byPage = new Map<string, (typeof rows)[number]>();

    for (const row of rows) {
      const existing = byPage.get(row.page ?? "");
      if (!existing || row.impressions > existing.impressions) {
        byPage.set(row.page ?? "", row);
      }
    }

    const pages = [...byPage.values()].sort((a, b) => b.impressions - a.impressions);
    if (pages.length < 2) continue;
    if (pages[1].impressions < pages[0].impressions * 0.25) continue;

    const totalImpressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    const totalClicks = rows.reduce((sum, row) => sum + row.clicks, 0);

    opportunities.push({
      id: createId("opp"),
      projectId: rows[0].projectId,
      type: "query_cannibalization",
      title: `Possibile cannibalizzazione: "${rows[0].query}"`,
      description: `${pages.length} URL competono sulla stessa query, per ${totalImpressions.toLocaleString("it-IT")} impression e ${totalClicks.toLocaleString("it-IT")} click. Verifica se consolidare contenuti o chiarire gli intenti.`,
      severity: totalImpressions >= 1000 ? "high" : "medium",
      score: Math.round(totalImpressions / 2),
      status: "open",
      detectedAt,
      rawJson: { query: rows[0].query, pages: pages.slice(0, 5) },
    });
  }

  return opportunities;
}
