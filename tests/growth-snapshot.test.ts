import assert from "node:assert/strict";
import test from "node:test";
import { getGrowthSnapshot } from "../lib/analytics/growth-snapshot";
import type { AppData } from "../lib/types";

function emptyData(): AppData {
  return {
    projects: [{ id: "project1", slug: "game", name: "My Game", type: "app", createdAt: "2026-01-01", updatedAt: "2026-10-10" }],
    metricSnapshots: [], searchQueries: [], pageMetrics: [], opportunities: [], connectorRuns: [],
    appReviews: [], appKeywords: [], asoKeywordSnapshots: [], asoAppRankSnapshots: [],
    gscDimensionBreakdowns: [], gscSitemaps: [], gscIndexInspections: [], admobMediationMetrics: [],
    ascMetadataSnapshots: [], ascExperiments: [], ascExperimentTreatments: [], playVitalsMetrics: [],
    playInstallStats: [], ascAnalyticsMetrics: [],
  };
}

test("cross-provider snapshot preserves missing values, independent dates and RevenueCat rolling semantics", () => {
  const data = emptyData();
  data.metricSnapshots = [
    { id: "g1", projectId: "project1", source: "gsc", date: "2026-09-01", clicks: 1000, impressions: 10000, avgPosition: 2, createdAt: "2026-09-04" },
    { id: "g2", projectId: "project1", source: "gsc", date: "2026-10-09", clicks: 5, impressions: 100, avgPosition: 8, createdAt: "2026-10-11" },
    { id: "g3", projectId: "project1", source: "gsc", date: "2026-10-08", clicks: 10, impressions: 300, avgPosition: 12, createdAt: "2026-10-11" },
    { id: "r1", projectId: "project1", source: "revenuecat", date: "2026-10-09", mrr: 100, revenue: 500, activeSubscribers: 40, currency: "EUR", createdAt: "2026-10-11" },
    { id: "r2", projectId: "project1", source: "revenuecat", date: "2026-10-10", mrr: 110, revenue: 520, activeSubscribers: 42, currency: "EUR", createdAt: "2026-10-11" },
  ];
  data.playInstallStats = [
    { id: "p1", projectId: "project1", date: "2026-10-09", installs: 20, uninstalls: 1, activeDeviceInstalls: 200, createdAt: "2026-10-11" },
  ];
  const result = getGrowthSnapshot(data, "project1", 28);
  assert.equal(result.seo.clicks, 15);
  assert.equal(result.seo.impressions, 400);
  assert.equal(result.seo.ctr, 15 / 400);
  assert.equal(result.seo.avgPosition, 11);
  assert.equal(result.seo.latestDataDate, "2026-10-09");
  assert.equal(result.seo.observedDays, 2);
  assert.equal(result.web.visitors, null);
  assert.equal(result.subscriptions?.mrr, 110);
  assert.equal(result.subscriptions?.rolling28dRevenue, 520, "rolling revenue must not sum successive snapshots");
  assert.equal(result.android.deviceInstalls, 20);
  assert.equal(result.ios.downloads, null);
});

test("unknown projects fail and mixed AdMob currencies are not added together", () => {
  const data = emptyData();
  assert.throws(() => getGrowthSnapshot(data, "missing"), /Unknown/);
  data.metricSnapshots = [
    { id: "a1", projectId: "project1", source: "admob", date: "2026-10-09", revenue: 5, currency: "EUR", createdAt: "2026-10-11" },
    { id: "a2", projectId: "project1", source: "admob", date: "2026-10-10", revenue: 10, currency: "USD", createdAt: "2026-10-11" },
  ];
  const result = getGrowthSnapshot(data, "project1", 7);
  assert.equal(result.advertising.estimatedRevenue, null);
  assert.match(result.advertising.warning ?? "", /currencies/);
});
