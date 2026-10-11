import assert from "node:assert/strict";
import test from "node:test";
import { buildSheetProjection } from "../lib/integrations/sheets-export";
import type { AppData } from "../lib/types";

test("private Sheet export excludes raw data, avoids duplicate AdMob totals and keeps rolling MRR distinct", () => {
  const data: AppData = {
    projects: [{ id: "p", slug: "game", name: "Game", type: "app", createdAt: "2026-01-01", updatedAt: "2026-10-11" }],
    metricSnapshots: [
      { id: "g", projectId: "p", date: "2026-10-09", source: "gsc", clicks: 500, createdAt: "2026-10-11" },
      { id: "a", projectId: "p", date: "2026-10-09", source: "admob", revenue: 5, currency: "EUR", createdAt: "2026-10-11" },
      { id: "r", projectId: "p", date: "2026-10-10", source: "revenuecat", mrr: 9, revenue: 25, currency: "EUR", rawJson: { customer_private: "secret" }, createdAt: "2026-10-11" },
    ], searchQueries: [], pageMetrics: [], connectorRuns: [],
    opportunities: [
      { id: "o1", projectId: "p", type: "striking_distance_query", title: "Low", description: "d", severity: "low", score: 10, status: "open", detectedAt: "2026-10-10", rawJson: { query: "q1", page: "https://x/a", clicks: 2, impressions: 100, ctr: 0.02, avgPosition: 8.5, projectId: "p", rawJson: { leaked: "secret" } } },
      { id: "o2", projectId: "p", type: "query_cannibalization", title: "High", description: "d", severity: "high", score: 90, status: "open", detectedAt: "2026-10-10", rawJson: { query: "q2", pages: [{ page: "https://x/a", clicks: 3, impressions: 60 }, { page: "https://x/b", clicks: 1, impressions: 40 }] } },
      { id: "o3", projectId: "gone", type: "low_ctr_page", title: "Orphan", description: "d", severity: "low", score: 99, status: "open", detectedAt: "2026-10-10" },
    ],
    appReviews: [], appKeywords: [], asoKeywordSnapshots: [], asoAppRankSnapshots: [],
    gscDimensionBreakdowns: [], gscSitemaps: [], gscIndexInspections: [], admobMediationMetrics: [],
    ascMetadataSnapshots: [], ascExperiments: [], ascExperimentTreatments: [], playVitalsMetrics: [],
    playInstallStats: [], ascAnalyticsMetrics: [],
  };
  const projection = buildSheetProjection(data, new Date("2026-10-11T12:00:00Z"));
  assert.equal(projection.OF_DailyMetrics.some((row) => row[2] === "gsc"), false);
  assert.equal(projection.OF_Revenue.filter((row) => row[2] === "admob").length, 1);
  assert.deepEqual(projection.OF_Revenue.filter((row) => row[2] === "revenuecat").map((row) => row[4]).sort(), ["mrr", "rolling_28d_revenue"]);
  assert.equal(JSON.stringify(projection).includes("customer_private"), false);
  assert.equal(JSON.stringify(projection).includes("secret"), false);
  assert.equal(projection.OF_Projects.length, 1);
  assert.deepEqual(projection.OF_Opportunities.map((row) => row[6]), ["High", "Low"]);
  assert.deepEqual(projection.OF_Opportunities[0].slice(8, 14), ["q2", "https://x/a | https://x/b", 4, 100, 0.04, null]);
  assert.deepEqual(projection.OF_Opportunities[1].slice(8, 14), ["q1", "https://x/a", 2, 100, 0.02, 8.5]);
});
