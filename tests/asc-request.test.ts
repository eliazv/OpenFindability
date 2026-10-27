import assert from "node:assert/strict";
import test from "node:test";
import { ascUrl, requestAscJson } from "../lib/connectors/asc-request";

test("relative API paths and official pagination stay on the Apple v1 origin", () => {
  assert.equal(ascUrl("/apps?limit=200").href, "https://api.appstoreconnect.apple.com/v1/apps?limit=200");
  assert.equal(ascUrl("https://api.appstoreconnect.apple.com/v1/apps?cursor=x").hostname, "api.appstoreconnect.apple.com");
  for (const path of ["https://evil.example/v1/apps", "http://api.appstoreconnect.apple.com/v1/apps", "../apps", "https://user:pass@api.appstoreconnect.apple.com/v1/apps"]) assert.throws(() => ascUrl(path));
});

test("network denial has actionable diagnostics without leaking secrets", async () => {
  const request = (async () => { throw new TypeError("Bearer super-private-key", { cause: { code: "EACCES" } }); }) as typeof fetch;
  await assert.rejects(requestAscJson("/apps?token=private-query", "super-private-key", {}, request), (error: Error) =>
    /EACCES/.test(error.message) && /sandbox/.test(error.message) && !/super-private|private-query/.test(error.message));
});

test("writes are never retried and timeout has a clear message", async () => {
  let attempts = 0;
  const request = (async () => { attempts++; throw new DOMException("private text", "TimeoutError"); }) as typeof fetch;
  await assert.rejects(requestAscJson("/apps/123", "secret", { method: "PATCH" }, request), /timeout/);
  assert.equal(attempts, 1);
});

test("JSON, empty successful responses, HTTP roles and malformed JSON are handled", async () => {
  const mock = (response: Response) => (async () => response) as typeof fetch;
  assert.deepEqual(await requestAscJson("/apps", "secret", {}, mock(Response.json({ data: [] }))), { data: [] });
  assert.equal(await requestAscJson("/apps", "secret", {}, mock(new Response(null, { status: 204 }))), undefined);
  await assert.rejects(requestAscJson("/apps", "secret", {}, mock(new Response("secret", { status: 403 }))), /role and app access/);
  await assert.rejects(requestAscJson("/apps", "secret", {}, mock(new Response("invalid"))), /invalid JSON/);
});
