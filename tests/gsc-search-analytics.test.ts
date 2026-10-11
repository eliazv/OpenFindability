import assert from "node:assert/strict";
import test from "node:test";
import type { google } from "googleapis";

import { pagedSearchAnalytics, queryDailyDetails } from "../lib/connectors/gsc";

type GscClient = ReturnType<typeof google.searchconsole>;
type Args = { siteUrl: string; requestBody: { startDate: string; endDate: string; startRow: number; dimensions: string[]; rowLimit: number; aggregationType: string; dataState: string } };

test("GSC pagination fetches the second 25k page and keeps the final status", async () => {
  const requests: Args[] = [];
  const client = {
    searchanalytics: {
      query: async (args: Args) => {
        requests.push(args);
        return { data: { rows: args.requestBody.startRow === 0
          ? Array.from({ length: 25_000 }, () => ({ keys: ["2026-10-09", "https://example.com/a"], clicks: 1 }))
          : [{ keys: ["2026-10-09", "https://example.com/b"], clicks: 1 }] } };
      },
    },
  } as unknown as GscClient;
  const result = await pagedSearchAnalytics(client, "sc-domain:example.com", "2026-10-09", "2026-10-09", ["date", "page"]);
  assert.equal(result.rows.length, 25_001);
  assert.equal(result.capped, false);
  assert.deepEqual(requests.map((r) => r.requestBody.startRow), [0, 25_000]);
  assert.equal(requests[0].requestBody.dataState, "final");
  assert.equal(requests[0].requestBody.aggregationType, "byPage");
});

test("hitting a weekly result cap falls back to single-day detail queries", async () => {
  const calls: Args[] = [];
  const client = {
    searchanalytics: {
      query: async (args: Args) => {
        calls.push(args);
        const { startDate, endDate, startRow } = args.requestBody;
        if (startDate !== endDate) {
          return { data: { rows: Array.from({ length: 25_000 }, () => ({ keys: [startDate, "q", "https://example.com"] })) } };
        }
        return { data: { rows: startRow === 0 ? [{ keys: [startDate, "q", "https://example.com"] }] : [] } };
      },
    },
  } as unknown as GscClient;
  const result = await queryDailyDetails(client, "sc-domain:example.com", "2026-10-01", "2026-10-07", ["query", "page"]);
  assert.equal(result.rows.length, 7);
  assert.equal(result.capped, false);
  assert.deepEqual(result.rows.map((r) => r.keys?.[0]), [
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07",
  ]);
  assert.equal(calls.filter((r) => r.requestBody.startDate === r.requestBody.endDate).length, 7);
});
