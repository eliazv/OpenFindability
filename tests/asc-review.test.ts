import assert from "node:assert/strict";
import test from "node:test";
import { AscReviewClient } from "../lib/connectors/asc-review";
import { requestAscJson } from "../lib/connectors/asc-request";

type Call = { method: string; path: string; body?: unknown };

function fakeAsc(routes: (call: Call) => unknown) {
  const calls: Call[] = [];
  const request = (async (url: URL, init: RequestInit = {}) => {
    const call = { method: init.method ?? "GET", path: decodeURIComponent(url.pathname + url.search).replace("/v1", ""),
      body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const result = routes(call);
    return result === undefined ? new Response(null, { status: 204 }) : Response.json(result);
  }) as unknown as typeof fetch;
  return { calls, request };
}

const build = { id: "b1", type: "builds", attributes: { processingState: "VALID", expired: false, usesNonExemptEncryption: false } };
const live = { id: "v0", type: "appStoreVersions", attributes: { versionString: "1.5.0", appVersionState: "READY_FOR_DISTRIBUTION", releaseType: "AFTER_APPROVAL" } };

function routes(versions: unknown[], submissions: unknown[] = []) {
  return (call: Call) => {
    if (call.path.startsWith("/builds?")) return { data: [build] };
    if (call.path.startsWith("/apps/1/appStoreVersions")) return { data: versions };
    if (call.path.startsWith("/reviewSubmissions?")) return { data: submissions };
    if (call.method === "POST" && call.path === "/appStoreVersions") return { data: { id: "v1", type: "appStoreVersions" } };
    if (call.path.endsWith("/appStoreVersionLocalizations")) return { data: [{ id: "l1", type: "x", attributes: { locale: "it" } }] };
    if (call.method === "POST" && call.path === "/reviewSubmissions") return { data: { id: "s1", type: "reviewSubmissions" } };
    if (call.path.includes("/items")) return { data: [] };
    if (call.method === "PATCH" && call.path === "/reviewSubmissions/s1") return { data: { id: "s1", type: "x", attributes: { state: "WAITING_FOR_REVIEW" } } };
    return undefined;
  };
}

test("new version: creates it, attaches the build, writes notes and submits in order", async () => {
  const { calls, request } = fakeAsc(routes([live]));
  const client = new AscReviewClient("t", request);
  const input = { appId: "1", versionString: "1.6.0", buildNumber: "13", whatsNew: "Novità" };
  const plan = await client.plan(input);
  assert.deepEqual(plan.problems, []);
  assert.equal(plan.releaseType, "AFTER_APPROVAL");
  const result = await client.submit(input, plan);
  assert.equal(result.submissionState, "WAITING_FOR_REVIEW");
  const writes = calls.filter((c) => c.method !== "GET").map((c) => c.method + " " + c.path);
  assert.deepEqual(writes, [
    "POST /appStoreVersions",
    "PATCH /appStoreVersions/v1/relationships/build",
    "PATCH /appStoreVersionLocalizations/l1",
    "POST /reviewSubmissions",
    "POST /reviewSubmissionItems",
    "PATCH /reviewSubmissions/s1",
  ]);
  assert.equal((calls.find((c) => c.path === "/appStoreVersionLocalizations/l1")!.body as any).data.attributes.whatsNew, "Novità");
});

test("already live version or a pending review blocks before any write", async () => {
  const { calls, request } = fakeAsc(routes([{ ...live, attributes: { ...live.attributes, versionString: "1.6.0" } }],
    [{ id: "s0", type: "reviewSubmissions", attributes: { state: "WAITING_FOR_REVIEW" } }]));
  const client = new AscReviewClient("t", request);
  const input = { appId: "1", versionString: "1.6.0", buildNumber: "13" };
  const plan = await client.plan(input);
  assert.equal(plan.problems.length, 2);
  await assert.rejects(client.submit(input, plan), /blocked/);
  assert.ok(calls.every((c) => c.method === "GET"));
});

test("Apple JSON errors are surfaced, raw text bodies are not", async () => {
  const json = (async () => Response.json({ errors: [{ code: "ENTITY_ERROR", detail: "whatsNew is required" }] }, { status: 409 })) as unknown as typeof fetch;
  await assert.rejects(requestAscJson("/reviewSubmissions", "t", { method: "PATCH" }, json), /ENTITY_ERROR: whatsNew is required/);
  const text = (async () => new Response("secret-body", { status: 409 })) as unknown as typeof fetch;
  await assert.rejects(requestAscJson("/reviewSubmissions", "t", {}, text), (error: Error) => !/secret-body/.test(error.message));
});
