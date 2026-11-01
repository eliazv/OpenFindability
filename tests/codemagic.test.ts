import assert from "node:assert/strict";
import test from "node:test";
import { CodemagicClient, codemagicBuildRequest, codemagicRunnerFromEnv, type CodemagicRunner } from "../lib/connectors/codemagic";
import { planIosRelease, type IosReleaseConfig } from "../lib/release-ios";

const runner: CodemagicRunner = {
  appId: "a".repeat(24),
  token: "super-secret-test-token",
  branch: "main",
  instanceType: "mac_mini_m2",
};
const config: IosReleaseConfig = {
  repository: "owner/app",
  appId: 12345,
  teamId: "ABCDEFGHIJ",
  bundleIds: ["com.example.app"],
  framework: "flutter",
  xcodeVersion: "26.6",
  flutterVersion: "3.38.0",
};
const buildId = "b".repeat(24);
const correlationId = "11111111-1111-4111-8111-111111111111";

function plan(mode: "check" | "unsigned" | "build" | "testflight" = "testflight") {
  return planIosRelease({
    slug: "demo",
    config,
    sha: "c".repeat(40),
    buildName: "1.2.3",
    builds: [],
    mode,
  });
}

test("Codemagic release request selects signed or unsigned workflow and toolchain", () => {
  const signed = codemagicBuildRequest(plan(), correlationId, runner);
  assert.equal(signed.workflowId, "ios-central-signed");
  assert.equal(signed.branch, "main");
  assert.equal(signed.instanceType, "mac_mini_m2");
  assert.equal(signed.environment.variables.MODE, "testflight");
  assert.equal(signed.environment.variables.SHA, "c".repeat(40));
  assert.deepEqual(signed.environment.softwareVersions, { xcode: "26.6", flutter: "3.38.0" });
  assert.equal(codemagicBuildRequest(plan("unsigned"), correlationId, runner).workflowId, "ios-central-unsigned");
  assert.throws(() => codemagicBuildRequest(plan("check"), correlationId, runner), /Preflight/);
  const cap = { ...plan("build"), config: { ...config, framework: "capacitor" as const, nodeVersion: "24.20.0" } };
  assert.deepEqual(codemagicBuildRequest(cap, correlationId, runner).environment.softwareVersions,
    { xcode: "26.6", node: "24.20.0" });
});

test("Codemagic credentials, branch and runtime are fail-closed", () => {
  assert.throws(() => codemagicRunnerFromEnv({}), /CODEMAGIC_API_TOKEN/);
  assert.throws(() => codemagicRunnerFromEnv({ CODEMAGIC_API_TOKEN: "token", CODEMAGIC_RUNNER_APP_ID: "bad" }), /APP_ID/);
  assert.throws(() => codemagicRunnerFromEnv({ CODEMAGIC_API_TOKEN: "token", CODEMAGIC_RUNNER_APP_ID: runner.appId,
    CODEMAGIC_RUNNER_BRANCH: "main/../bad" }), /Unsafe/);
  assert.throws(() => codemagicRunnerFromEnv({ CODEMAGIC_API_TOKEN: "token", CODEMAGIC_RUNNER_APP_ID: runner.appId,
    CODEMAGIC_INSTANCE_TYPE: "mac_mini_m4x" }), /INSTANCE_TYPE/);
});

test("dispatch is one API POST, records actual build ID and never retries ambiguous timeouts", async () => {
  let calls = 0;
  const client = new CodemagicClient(runner, (async (url, init) => {
    calls++;
    assert.equal(url, "https://api.codemagic.io/builds");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)["x-auth-token"], runner.token);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.appId, runner.appId);
    assert.equal(body.environment.variables.CORRELATION_ID, correlationId);
    return Response.json({ buildId });
  }) as typeof fetch);
  assert.deepEqual(await client.dispatch(plan(), correlationId), { buildId });
  assert.equal(calls, 1);

  const failed = new CodemagicClient(runner, (async () => { calls++; throw new Error("network timeout"); }) as typeof fetch);
  await assert.rejects(failed.dispatch(plan(), correlationId), /timeout/);
  assert.equal(calls, 2);
});

test("no token/provider-response disclosure; missing build ID cannot be mistaken for success", async () => {
  const denied = new CodemagicClient(runner, (async () => new Response(runner.token, { status: 403 })) as typeof fetch);
  await assert.rejects(denied.dispatch(plan(), correlationId),
    (error: Error) => error.message.includes("403") && !error.message.includes(runner.token));
  const incomplete = new CodemagicClient(runner, (async () => Response.json({ message: "queued" })) as typeof fetch);
  await assert.rejects(incomplete.dispatch(plan(), correlationId), /ambiguous/);
});

test("status reads Codemagic build but never infers TestFlight readiness", async () => {
  const client = new CodemagicClient(runner, (async (url) => {
    assert.equal(url, "https://api.codemagic.io/builds/" + buildId);
    return Response.json({ build: {
      status: "finished", workflowId: "ios-central-signed",
      buildActions: [{ type: "publishing", status: "success" }],
    } });
  }) as typeof fetch);
  const result = await client.getBuild(buildId);
  assert.equal(result.status, "finished");
  assert.equal(result.publishingStatus, "success");
  assert.match(result.url, /codemagic.io\/app/);
  await assert.rejects(client.getBuild("bad-id"), /Invalid Codemagic build ID/);
});
