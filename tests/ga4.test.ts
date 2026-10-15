import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGa4Days } from "../lib/connectors/ga4";

test("GA4 daily responses normalize known metrics and preserve provider grain", () => {
  const result = normalizeGa4Days("project-1", {
    rowCount: 2,
    metadata: { timeZone: "Europe/Rome" },
    rows: [
      { dimensionValues: [{ value: "20261009" }], metricValues: [{ value: "12" }, { value: "19" }, { value: "31" }, { value: "2" }] },
      { dimensionValues: [{ value: "20261010" }], metricValues: [{ value: "20" }, { value: "24" }, { value: "45" }, { value: "3" }] },
    ],
  }, "2026-10-11");
  assert.equal(result.length, 2);
  assert.equal(result[0].date, "2026-10-09");
  assert.equal(result[0].visitors, 12);
  assert.equal(result[0].pageviews, 31);
  assert.equal(result[0].sessions, 19);
  assert.equal(result[0].keyEvents, 2);
  assert.deepEqual(result[0].rawJson, {
    activeUsers: 12, sessions: 19, screenPageViews: 31, keyEvents: 2, ga4TimeZone: "Europe/Rome", grain: "daily",
  });
});

test("GA4 never treats truncated or invalid API values as successful observations", () => {
  assert.throws(() => normalizeGa4Days("p", { rowCount: 2, rows: [] }, "2026-10-11"), /incomplete/);
  assert.throws(() => normalizeGa4Days("p", {
    rows: [{ dimensionValues: [{ value: "20261343" }], metricValues: [{ value: "1" }, { value: "2" }, { value: "3" }, { value: "4" }] }],
  }, "2026-10-11"), /invalid date/);
  assert.throws(() => normalizeGa4Days("p", {
    rows: [{ dimensionValues: [{ value: "20261010" }], metricValues: [{ value: "NaN" }, { value: "2" }, { value: "3" }, { value: "4" }] }],
  }, "2026-10-11"), /invalid metric/);
});
