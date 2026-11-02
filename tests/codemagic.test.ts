import assert from "node:assert/strict";
import test from "node:test";
import { CodemagicClient, codemagicBuildRequest, codemagicPinProblems, codemagicRunnerFromEnv, codemagicUploadRequest, failureLines, runnerPolicy, type CodemagicRunner } from "../lib/connectors/codemagic";
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
  scheme: "Runner",
  targets: { Runner: "com.example.app" },
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

test("missing pins or native targets are reported and block the paid build", () => {
  const { xcodeVersion: _xcode, flutterVersion: _flutter, ...unpinned } = config;
  const { targets: _targets, ...noTargets } = config;
  assert.equal(codemagicPinProblems(config).length, 0);
  assert.equal(codemagicPinProblems(unpinned).length, 2);
  assert.match(codemagicPinProblems(noTargets)[0], /ios-setup/);
  assert.match(codemagicPinProblems({ ...config, framework: "capacitor" })[0], /nodeVersion/);
  assert.throws(() => codemagicBuildRequest({ ...plan(), config: unpinned }, correlationId, runner), /xcodeVersion/);
});

test("each build carries a policy approving only its own SHA", () => {
  const decoded = (value: string) => JSON.parse(Buffer.from(value, "base64").toString());
  const app = decoded(runnerPolicy(plan())).demo;
  assert.equal(app.enabled, true);
  assert.deepEqual(app.approvedShas, ["c".repeat(40)]);
  assert.equal(app.workingDirectory, ".");
  assert.deepEqual(decoded(codemagicBuildRequest(plan(), correlationId, runner).environment.variables.RUNNER_APPS_B64).demo, app);
});

test("stale native lock is passed to the runner only when planned", () => {
  const variables = (refreshPods: boolean) => codemagicBuildRequest({ ...plan(), refreshPods }, correlationId, runner).environment.variables;
  assert.equal(variables(true).REFRESH_PODS, "1");
  assert.equal(variables(false).REFRESH_PODS, "0");
});

test("failure lines keep the root cause and drop noise", () => {
  const log = [
    "Analyzing",
    "CDN: trunk Relative path downloaded",
    "<span>[!] CocoaPods could not find compatible versions</span>",
    "/vendor/bundle/gems/molinillo/resolution.rb:317",
    "None of your spec sources contain a spec",
  ].join("\n");
  assert.deepEqual(failureLines(log), ["[!] CocoaPods could not find compatible versions", "None of your spec sources contain a spec"]);
  assert.deepEqual(failureLines("a\nb\nc", 2), ["b", "c"]);
  assert.deepEqual(failureLines("Failed to build iOS app\nwarning: noise\nmissing asset\nTarget bundle failed: Exception\nCommand PhaseScriptExecution failed with a nonzero exit code\nnote: more"),
    ["missing asset", "Target bundle failed: Exception", "Command PhaseScriptExecution failed with a nonzero exit code", "note: more"]);
  assert.deepEqual(failureLines("[!] just a warning\nok\nFailed to build iOS app\nreason\nreason"), ["Failed to build iOS app", "reason"]);
  assert.deepEqual(failureLines("[!] deprecated pod\nTraceback (most recent call last):\nboom"), ["Traceback (most recent call last):", "boom"]);
});

test("upload retry reuses the IPA artifact and selects the upload workflow", async () => {
  const request = codemagicUploadRequest(plan(), correlationId, runner, "https://example.test/ipa");
  assert.equal(request.workflowId, "ios-central-upload");
  assert.equal(request.environment.variables.IPA_URL, "https://example.test/ipa");
  const artifact = "https://api.codemagic.io/artifacts/abc/def/release.ipa";
  const calls: string[] = [];
  const client = new CodemagicClient(runner, (async (url, init) => {
    calls.push((init?.method ?? "GET") + " " + url);
    if (String(url).endsWith("/public-url")) return Response.json({ url: "https://example.test/temporary" });
    if (init?.method === "POST") {
      assert.equal(JSON.parse(String(init.body)).environment.variables.IPA_URL, "https://example.test/temporary");
      return Response.json({ buildId });
    }
    return Response.json({ build: { artefacts: [{ name: "release.ipa", url: artifact }] } });
  }) as typeof fetch);
  assert.deepEqual(await client.dispatchUpload(plan(), correlationId, buildId), { buildId });
  assert.deepEqual(calls, ["GET https://api.codemagic.io/builds/" + buildId, "POST " + artifact + "/public-url", "POST https://api.codemagic.io/builds"]);
  await assert.rejects(client.releaseReceipt(buildId), /release\.json/);
});

test("wait polls read-only until a final status", async () => {
  const statuses = ["queued", "building", "finished"];
  const seen: string[] = [];
  const client = new CodemagicClient(runner, (async (_url, init) => {
    assert.equal(init?.method, undefined);
    return Response.json({ build: { status: statuses.shift() } });
  }) as typeof fetch);
  const build = await client.waitForBuild(buildId, { intervalMs: 1, onStatus: (status) => seen.push(status) });
  assert.equal(build.status, "finished");
  assert.deepEqual(seen, ["queued", "building", "finished"]);
});

test("secrets are sent as secure, once, and the API error never carries values", async () => {
  const calls: { url: string; body?: string }[] = [];
  const client = new CodemagicClient(runner, (async (url, init) => {
    calls.push({ url: String(url), body: init?.body as string | undefined });
    if (init?.method === "POST" && String(url).endsWith("/variables")) return new Response(null, { status: 403 });
    if (init?.method === "POST") return Response.json({ data: { id: "new-group" } }, { status: 201 });
    return Response.json({ data: [], page_size: 30, current_page: 1, total_pages: 0 });
  }) as typeof fetch);
  assert.equal(await client.ensureVariableGroup("ios_source"), "new-group");
  assert.equal(calls[0].url, "https://codemagic.io/api/v3/apps/" + runner.appId + "/variable-groups?page=1");
  await client.addSecrets("group", []);
  assert.equal(calls.length, 2);
  await assert.rejects(client.addSecrets("group", [{ name: "KEY", value: "secret-value" }]),
    (error: Error) => error.message.includes("403") && !error.message.includes("secret-value"));
  assert.deepEqual(JSON.parse(calls[2].body!), { secure: true, variables: [{ name: "KEY", value: "secret-value" }] });
});

test("cancel reports 208 as already finished and tolerates an empty success body", async () => {
  const respond = (status: number) => new CodemagicClient(runner, (async (url, init) => {
    assert.equal(url, "https://api.codemagic.io/builds/" + buildId + "/cancel");
    assert.equal(init?.method, "POST");
    return new Response(null, { status });
  }) as typeof fetch);
  assert.equal(await respond(200).cancelBuild(buildId), "cancel_requested");
  assert.equal(await respond(208).cancelBuild(buildId), "already_finished");
  await assert.rejects(respond(404).cancelBuild(buildId), /404/);
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
