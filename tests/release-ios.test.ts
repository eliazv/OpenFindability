import assert from "node:assert/strict";
import test from "node:test";
import { GitHubActionsClient, type ReleaseRunner } from "../lib/connectors/github-actions";
import { iosWorkflowInputs, planIosRelease, validateIosConfig, type IosReleaseConfig } from "../lib/release-ios";

test("Capacitor configurations and two-component marketing versions are supported", () => {
  assert.equal(planIosRelease({ ...options, config: { ...config, framework: "capacitor", workingDirectory: "apps/demo" }, buildName: "2.130" }).buildName, "2.130");
  assert.throws(() => validateIosConfig({ ...config, workingDirectory: "../demo" }), /relative/);
  assert.throws(() => validateIosConfig({ ...config, framework: "native" } as never), /Supported/);
});

const config: IosReleaseConfig = { repository: "owner/app", appId: 123, teamId: "ABCDEFGHIJ", bundleIds: ["com.example.app", "com.example.app.Widget"], framework: "flutter" };
const options = { slug: "demo", config, sha: "a".repeat(40), buildName: "1.2.3", builds: [{ id: "old", version: "7", processingState: "PROCESSING", rawJson: {} }] };
const runner: ReleaseRunner = { repository: "owner/runner", ref: "main", workflow: "release-ios.yml", token: "offline-test" };

test("auto accounts for processing builds; dry-run cannot dispatch", () => {
  const plan = planIosRelease(options);
  assert.equal(plan.buildNumber, "8");
  assert.throws(() => iosWorkflowInputs(plan, "test"), /Dry-run/);
  assert.equal(iosWorkflowInputs({ ...plan, mode: "testflight" }, "test").mode, "testflight");
});

test("rejects duplicate/unsafe build numbers and ambiguous dotted numbering", () => {
  for (const number of ["7", "0", "-1", "8.1", "9007199254740992", "8;echo bad"]) {
    assert.throws(() => planIosRelease({ ...options, buildNumber: number }));
  }
  assert.throws(() => planIosRelease({ ...options, builds: [{ id: "x", version: "1.2", rawJson: {} }] }), /ambiguous/);
});

test("rejects refs, shell/path inputs and inconsistent identities", () => {
  for (const sha of ["main", "refs/pull/1/head", "../path", "$(secret)"]) assert.throws(() => planIosRelease({ ...options, sha }));
  assert.throws(() => planIosRelease({ ...options, slug: "../demo" }));
  assert.throws(() => validateIosConfig({ ...config, repository: "https://evil/app" }));
  assert.throws(() => validateIosConfig({ ...config, bundleIds: ["com.example.app", "com.example.app"] }));
  assert.throws(() => validateIosConfig({ ...config, teamId: "bad" }));
});

test("private repository enforced and API failures do not leak token/body", async () => {
  const publicClient = new GitHubActionsClient(runner, (async () => Response.json({ private: false })) as typeof fetch);
  await assert.rejects(publicClient.assertPrivate(), /must be private/);
  const denied = new GitHubActionsClient(runner, (async () => new Response("offline-test", { status: 403 })) as typeof fetch);
  await assert.rejects(denied.assertPrivate(), (error: Error) => /403/.test(error.message) && !error.message.includes(runner.token));
});

test("dispatch requests run details; accepts 204 without inventing run IDs; never retries", async () => {
  let count = 0;
  const client = new GitHubActionsClient(runner, (async (_url, init) => {
    count++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.return_run_details, true);
    assert.equal(body.inputs.sha, options.sha);
    return new Response(null, { status: 204 });
  }) as typeof fetch);
  assert.equal(await client.dispatch(iosWorkflowInputs(planIosRelease({ ...options, mode: "build" }), "id")), undefined);
  assert.equal(count, 1);
  const failed = new GitHubActionsClient(runner, (async () => { count++; throw new Error("Timeout"); }) as typeof fetch);
  await assert.rejects(failed.dispatch({}), /Timeout/);
  assert.equal(count, 2);
});
