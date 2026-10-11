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
    ], connectorRuns: [],
    searchQueries: [
      { id: "q1", projectId: "p", date: "2026-10-08", query: "kw", page: "https://x/a", clicks: 1, impressions: 10, ctr: 0.1, avgPosition: 4, rawJson: { _openfindability: { version: 2, grain: "day" } } },
      { id: "q2", projectId: "p", date: "2026-10-09", query: "kw", page: "https://x/a", clicks: 3, impressions: 30, ctr: 0.1, avgPosition: 8, rawJson: { _openfindability: { version: 2, grain: "day" } } },
      { id: "q3", projectId: "p", date: "2026-10-09", query: "legacy", page: "https://x/a", clicks: 900, impressions: 9000, ctr: 0.1, avgPosition: 1 },
    ],
    pageMetrics: [],
    opportunities: [
      { id: "o1", projectId: "p", type: "striking_distance_query", title: "Low", description: "d", severity: "low", score: 10, status: "open", detectedAt: "2026-10-10", rawJson: { query: "q1", page: "https://x/a", clicks: 2, impressions: 100, ctr: 0.02, avgPosition: 8.5, projectId: "p", rawJson: { leaked: "secret" } } },
      { id: "o2", projectId: "p", type: "query_cannibalization", title: "High", description: "d", severity: "high", score: 90, status: "open", detectedAt: "2026-10-10", rawJson: { query: "q2", pages: [{ page: "https://x/a", clicks: 3, impressions: 60 }, { page: "https://x/b", clicks: 1, impressions: 40 }] } },
      { id: "o3", projectId: "gone", type: "low_ctr_page", title: "Orphan", description: "d", severity: "low", score: 99, status: "open", detectedAt: "2026-10-10" },
    ],
    appReviews: [], appKeywords: [], asoKeywordSnapshots: [], asoAppRankSnapshots: [],
    gscDimensionBreakdowns: [
      { id: "b1", projectId: "p", rangeStart: "2026-08-01", rangeEnd: "2026-08-30", dimension: "device", key: "MOBILE", clicks: 1, impressions: 9, ctr: 0.1, avgPosition: 3, createdAt: "2026-09-01" },
      { id: "b2", projectId: "p", rangeStart: "2026-09-10", rangeEnd: "2026-10-09", dimension: "device", key: "MOBILE", clicks: 5, impressions: 50, ctr: 0.1, avgPosition: 4, createdAt: "2026-10-11" },
    ],
    gscSitemaps: [],
    gscIndexInspections: [
      { id: "i1", siteUrl: "sc-domain:x", url: "https://x/a", inspectionDate: "2026-09-01", inspectedAt: "2026-09-01T10:00:00Z", discoveredFrom: [], issueCode: "not_found", severity: "high" },
      { id: "i2", siteUrl: "sc-domain:x", url: "https://x/a", inspectionDate: "2026-10-01", inspectedAt: "2026-10-01T10:00:00Z", discoveredFrom: [], issueCode: "indexed", severity: "none" },
      { id: "i3", siteUrl: "sc-domain:x", url: "https://x/b", inspectionDate: "2026-10-01", inspectedAt: "2026-10-01T10:00:00Z", discoveredFrom: [], issueCode: "crawled_not_indexed", severity: "medium" },
    ],
    admobMediationMetrics: [],
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
  // Only the newest breakdown range, and only the latest inspection of each URL.
  assert.deepEqual(projection.OF_GscBreakdowns.map((row) => row[9]), ["2026-10-09"]);
  assert.deepEqual(projection.OF_GscIndexIssues.map((row) => [row[2], row[3]]), [["https://x/b", "crawled_not_indexed"]]);
  assert.deepEqual(projection.OF_GscIndexSummary.map((row) => [row[2], row[4]]), [["crawled_not_indexed", 1], ["indexed", 1]]);
  assert.deepEqual(projection.OF_GscDaily, [["p", "game", "2026-10-09", 500, 0, null, null]]);
  // Daily rows are merged with an impression-weighted position; legacy range aggregates are excluded.
  assert.deepEqual(projection.OF_GscQueries.map((row) => row.slice(2, 8)), [["kw", "https://x/a", 4, 40, 0.1, 7]]);
  assert.deepEqual(projection.OF_Opportunities.map((row) => row[6]), ["High", "Low"]);
  assert.deepEqual(projection.OF_Opportunities[0].slice(8, 14), ["q2", "https://x/a | https://x/b", 4, 100, 0.04, null]);
  assert.deepEqual(projection.OF_Opportunities[1].slice(8, 14), ["q1", "https://x/a", 2, 100, 0.02, 8.5]);
});
