import assert from "node:assert/strict";
import test from "node:test";
import { buildOpportunities, summarizeProject } from "../lib/insights";
import type { AppData, SearchQueryMetric } from "../lib/types";

function emptyData(): AppData {
  return {
    projects: [], metricSnapshots: [], searchQueries: [], pageMetrics: [],
    opportunities: [], connectorRuns: [], appReviews: [], appKeywords: [],
    asoKeywordSnapshots: [], asoAppRankSnapshots: [], gscDimensionBreakdowns: [],
    gscSitemaps: [], gscIndexInspections: [], admobMediationMetrics: [],
    ascMetadataSnapshots: [], ascExperiments: [], ascExperimentTreatments: [],
    playVitalsMetrics: [], playInstallStats: [], ascAnalyticsMetrics: [],
  };
}

test("project summary is scoped to latest 28 available days, not lifetime", () => {
  const data = emptyData();
  data.metricSnapshots = [
    { id: "old", projectId: "one", source: "gsc", date: "2026-08-01", clicks: 2000, impressions: 20000, createdAt: "2026-08-03" },
    { id: "now", projectId: "one", source: "gsc", date: "2026-10-09", clicks: 8, impressions: 100, createdAt: "2026-10-11" },
    { id: "yesterday", projectId: "one", source: "umami", date: "2026-10-10", visitors: 12, pageviews: 20, createdAt: "2026-10-11" },
    { id: "old-ads", projectId: "one", source: "admob", date: "2026-08-01", revenue: 500, currency: "EUR", createdAt: "2026-08-02" },
    { id: "new-ads", projectId: "one", source: "admob", date: "2026-10-10", revenue: 2.5, currency: "EUR", createdAt: "2026-10-11" },
  ];
  const summary = summarizeProject(data, "one");
  assert.equal(summary.clicks, 8);
  assert.equal(summary.impressions, 100);
  assert.equal(summary.gscLatestDate, "2026-10-09");
  assert.equal(summary.visitors, 12);
  assert.equal(summary.adRevenue, 2.5);
});

test("small projects are represented in opportunity lists even when another site is larger", () => {
  const data = emptyData();
  const rows: SearchQueryMetric[] = [];
  for (const projectId of ["large", "small"]) {
    const count = projectId === "large" ? 55 : 3;
    for (let i = 0; i < count; i++) {
      rows.push({
        id: `${projectId}-${i}`, projectId,
        date: "2026-10-09", query: `query-${projectId}-${i}`,
        page: `https://example.com/${i}`,
        clicks: 1, impressions: 1200, ctr: 1 / 1200, avgPosition: 9,
        rawJson: { _openfindability: { version: 2, grain: "day" } },
      });
    }
  }
  data.searchQueries = rows;
  const results = buildOpportunities(data);
  assert.ok(results.some((o) => o.projectId === "large"));
  assert.ok(results.some((o) => o.projectId === "small"));
  assert.ok(results.filter((o) => o.projectId === "large").length <= 30);
  assert.ok(results.filter((o) => o.projectId === "small").length > 0);
});
