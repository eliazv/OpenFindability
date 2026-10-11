import assert from "node:assert/strict";
import test from "node:test";

import { aggregateDailyQueryRows, dailyGscPages, dailyGscQueries, isDailyGscDetail, recentGscDetails } from "../lib/gsc-detail";
import type { AppData, PageMetric, SearchQueryMetric } from "../lib/types";

const daily = (date: string) => ({
  _openfindability: { version: 2, grain: "day" as const, property: "sc-domain:example.com", fetchedAt: "2026-10-11" },
  keys: [date],
});

function query(date: string, page: string, clicks: number, impressions: number, avgPosition: number): SearchQueryMetric {
  return {
    id: `query-${date}-${page}`, projectId: "p1", date, query: "example keyword", page,
    clicks, impressions, ctr: clicks / impressions, avgPosition, rawJson: daily(date),
  };
}

function page(date: string, clicks: number, impressions: number, avgPosition: number): PageMetric {
  return {
    id: `page-${date}`, projectId: "p1", date, page: "https://example.com/a",
    clicks, impressions, ctr: clicks / impressions, avgPosition, rawJson: daily(date),
  };
}

function data(queries: SearchQueryMetric[], pages: PageMetric[]): AppData {
  return {
    projects: [],
    metricSnapshots: [{ id: "s", projectId: "p1", source: "gsc", date: "2026-10-09", createdAt: "2026-10-11", impressions: 100, clicks: 10 }],
    searchQueries: queries,
    pageMetrics: pages,
    opportunities: [], connectorRuns: [], appReviews: [], appKeywords: [],
    asoKeywordSnapshots: [], asoAppRankSnapshots: [], gscDimensionBreakdowns: [],
    gscSitemaps: [], gscIndexInspections: [], admobMediationMetrics: [],
    ascMetadataSnapshots: [], ascExperiments: [], ascExperimentTreatments: [],
    playVitalsMetrics: [], playInstallStats: [], ascAnalyticsMetrics: [],
  };
}

test("legacy 30-day range rows are retained in data, but never included in daily reports", () => {
  const legacy = { ...query("2026-10-09", "https://example.com/a", 99, 9999, 1), id: "legacy", rawJson: { keys: ["example keyword", "https://example.com/a"] } };
  const oldPage = { ...page("2026-10-09", 70, 5000, 2), rawJson: { keys: ["https://example.com/a"] } };
  const current = query("2026-10-09", "https://example.com/a", 2, 100, 8);
  const model = data([legacy, current], [oldPage, page("2026-10-09", 2, 100, 8)]);
  assert.equal(isDailyGscDetail(legacy), false);
  assert.equal(dailyGscQueries(model.searchQueries).length, 1);
  assert.equal(dailyGscPages(model.pageMetrics).length, 1);
  assert.equal(recentGscDetails(model).queries[0].impressions, 100);
});

test("28-day summaries aggregate actual daily rows with impression-weighted position", () => {
  const model = data([
    query("2026-10-08", "https://example.com/a", 2, 100, 5),
    query("2026-10-09", "https://example.com/a", 6, 300, 9),
    query("2026-10-09", "https://example.com/b", 1, 50, 13),
    query("2026-09-01", "https://example.com/a", 100, 10000, 1),
  ], [page("2026-10-08", 2, 100, 5), page("2026-10-09", 6, 300, 9)]);
  const { queries, pages } = recentGscDetails(model);
  assert.equal(queries.length, 2, "same query on different pages must not be collapsed");
  const main = queries.find((r) => r.page?.endsWith("/a"))!;
  assert.equal(main.impressions, 400);
  assert.equal(main.clicks, 8);
  assert.equal(main.ctr, 0.02);
  assert.equal(main.avgPosition, 8);
  assert.equal(pages[0].avgPosition, 8);
  assert.equal(pages[0].impressions, 400);
});

test("query ranking aggregates multiple dates instead of returning the best individual day", () => {
  const rows = [query("2026-10-08", "https://example.com/a", 2, 100, 5), query("2026-10-09", "https://example.com/a", 6, 300, 9)];
  const result = aggregateDailyQueryRows(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].clicks, 8);
  assert.equal(result[0].impressions, 400);
});
