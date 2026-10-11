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
    ], searchQueries: [], pageMetrics: [], opportunities: [], connectorRuns: [],
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
});
