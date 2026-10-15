import assert from "node:assert/strict";
import test from "node:test";
import { bingDate, parseBingRows, syncBingProject } from "../lib/connectors/bing";
import { parseClarity } from "../lib/connectors/clarity";
import { fetchJson, observation } from "../lib/connectors/seo-geo-common";
import { syncCloudflareProject } from "../lib/connectors/cloudflare-ai";
import type { Project } from "../lib/types";

const project: Project = { id: "p", slug: "site", name: "Site", type: "web", websiteUrl: "https://example.com", bingSiteUrl: "https://example.com/", cloudflareZoneId: "z", createdAt: "2026-10-01", updatedAt: "2026-10-01" };
test("Bing dates preserve provider-local reporting day, including positive offsets", () => {
  assert.equal(bingDate(`/Date(${Date.parse("2026-10-14T22:00:00Z")}+0200)/`), "2026-10-15");
  assert.equal(bingDate(`/Date(${Date.parse("2026-10-15T07:00:00Z")}-0700)/`), "2026-10-15");
  assert.throws(() => bingDate("bad"));
});
test("Bing preserves zero counts and separates unknown detail grain from daily totals", () => {
  const raw = { Date: "2026-10-14", Query: "example", Clicks: 0, Impressions: 0 };
  const result = parseBingRows(project, "query", [raw], "2026-10-15T00:00:00Z", "2026-10-01", "2026-10-14");
  assert.equal(result.snapshots.length, 0);
  assert.equal(result.observations[0].grain, "provider_period");
  assert.equal(result.observations[0].metrics.ctr, null);
  assert.deepEqual(result.observations[0].rawJson, raw);
  assert.throws(() => parseBingRows(project, "daily", [{ Date: "2026-10-14", Clicks: 1 }], "now", "2026-10-01", "2026-10-15"));
});
test("Clarity preserves approximate rolling windows, refuses unrelated URL attribution", () => {
  const rows = parseClarity(project, [{ metricName: "Traffic", information: [{ Url: "https://www.example.com/a", totalSessionCount: 2 }, { Url: "https://other.com", totalSessionCount: 99 }] }], "2026-10-15T12:00:00Z");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].windowStart, "2026-10-14T12:00:00.000Z");
  assert.equal(rows[0].grain, "rolling_window");
  assert.equal(rows[0].coverage.overlapping, true);
  assert.equal(rows[0].metrics.totalSessionCount, 2);
});
test("observation identity ignores fetch time but includes scope and window", () => {
  const base = { projectId: "p", source: "clarity" as const, kind: "Traffic", windowStart: "start", windowEnd: "end", grain: "rolling_window" as const, scope: "url", metrics: {}, coverage: {}, rawJson: {}, fetchedAt: "one" };
  assert.equal(observation(base).id, observation({ ...base, fetchedAt: "two" }).id);
  assert.notEqual(observation(base).id, observation({ ...base, scope: "url2" }).id);
});
test("provider failures do not expose credential-bearing URLs or response bodies", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response("secret token echoed", { status: 403 });
  try { await assert.rejects(fetchJson("https://example.com?apikey=secret", {}, 1), e => e instanceof Error && e.message === "Provider request failed (HTTP 403)."); }
  finally { globalThis.fetch = previous; }
});
test("Bing retains successful daily import when a detail endpoint fails", async () => {
  const previous = globalThis.fetch, key = process.env.BING_WEBMASTER_API_KEY;
  process.env.BING_WEBMASTER_API_KEY = "fixture";
  globalThis.fetch = async url => String(url).includes("GetRankAndTrafficStats")
    ? Response.json({ d: [{ Date: "2026-10-14", Clicks: 1, Impressions: 3 }] }) : new Response("no", { status: 403 });
  try {
    const result = await syncBingProject(project, "2026-10-01", "2026-10-14");
    assert.equal(result.result.status, "partial"); assert.equal(result.snapshots.length, 1);
  } finally { globalThis.fetch = previous; if (key === undefined) delete process.env.BING_WEBMASTER_API_KEY; else process.env.BING_WEBMASTER_API_KEY = key; }
});
test("Cloudflare GraphQL permission errors are not interpreted as zero traffic", async () => {
  const previous = globalThis.fetch, key = process.env.CLOUDFLARE_API_TOKEN_2;
  process.env.CLOUDFLARE_API_TOKEN_2 = "fixture";
  globalThis.fetch = async () => Response.json({ errors: [{ message: "not allowed" }] });
  try { await assert.rejects(syncCloudflareProject(project), /not allowed/); }
  finally { globalThis.fetch = previous; if (key === undefined) delete process.env.CLOUDFLARE_API_TOKEN_2; else process.env.CLOUDFLARE_API_TOKEN_2 = key; }
});

test("Cloudflare scopes shared-zone groups to the website and preserves empty-window coverage", async () => {
  const previous = globalThis.fetch, key = process.env.CLOUDFLARE_API_TOKEN_2;
  process.env.CLOUDFLARE_API_TOKEN_2 = "fixture";
  const dimensions = { datetimeHour: "2026-10-15T06:00:00Z", userAgent: "GPTBot", clientRequestHTTPHost: "other.example.com", clientRequestPath: "/", edgeResponseStatus: 200 };
  globalThis.fetch = async () => Response.json({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [{ count: 20, dimensions, avg: { sampleInterval: 1 } }] }] } } });
  try {
    const result = await syncCloudflareProject(project);
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].kind, "coverage");
    assert.equal(result.observations[0].metrics.returnedGroups, 0);
    assert.ok(result.replaceWindow);
  } finally { globalThis.fetch = previous; if (key === undefined) delete process.env.CLOUDFLARE_API_TOKEN_2; else process.env.CLOUDFLARE_API_TOKEN_2 = key; }
});
