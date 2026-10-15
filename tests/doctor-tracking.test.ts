import assert from "node:assert/strict";
import test from "node:test";
import { getLatestSyncProblems } from "../lib/doctor";
import type { Project, ConnectorRun } from "../lib/types";

test("disconnected sources stop warning while their historical runs remain intact", () => {
  const project: Project = { id: "p", name: "Example", slug: "example", type: "app", createdAt: "2026-10-01", updatedAt: "2026-10-15" };
  const runs: ConnectorRun[] = ["asc_analytics", "play_stats", "admob"].map((source, i) => ({ id: String(i), projectId: "p", source: source as ConnectorRun["source"], status: "no_data", startedAt: "2026-10-15", finishedAt: "2026-10-15" }));
  assert.deepEqual(getLatestSyncProblems({ projects: [project], connectorRuns: runs }), []);
  project.appStoreTrackId = 123;
  assert.equal(getLatestSyncProblems({ projects: [project], connectorRuns: runs }).length, 1);
  assert.match(getLatestSyncProblems({ projects: [project], connectorRuns: runs })[0], /asc_analytics/);
  assert.equal(runs.length, 3);
});
