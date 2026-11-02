import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getAscApp, listAscBuilds } from "@/lib/connectors/appstoreconnect";
import { CodemagicClient, codemagicPinProblems, codemagicRunnerFromEnv, runnerPolicyProblems, type RunnerPolicyApp } from "@/lib/connectors/codemagic";
import { GitHubActionsClient, releaseRunnerFromEnv } from "@/lib/connectors/github-actions";
import { iosWorkflowInputs, planIosRelease } from "@/lib/release-ios";
import { appendConnectorRun, readProjects } from "@/lib/store";
import { createId } from "@/lib/id";
import { resolveIosProject } from "@/lib/release-ios-project";

type Provider = "codemagic" | "github";

const RUNNER_POLICY_PATH = "secrets/ios/runner-apps.json";

async function readRunnerPolicy(): Promise<Record<string, RunnerPolicyApp> | undefined> {
  try {
    return JSON.parse(await readFile(RUNNER_POLICY_PATH, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Dry-run unless --apply, like every other write to an external platform. */
async function runIosCancel(projectId: string, buildId: string, apply: boolean): Promise<void> {
  const client = new CodemagicClient(codemagicRunnerFromEnv());
  if (!apply) {
    console.log(JSON.stringify({ build: await client.getBuild(buildId) }, null, 2));
    console.log("Dry run: build not cancelled. Add --apply to cancel it.");
    return;
  }
  const startedAt = new Date().toISOString();
  const result = await client.cancelBuild(buildId);
  await appendConnectorRun({ id: createId("run"), projectId, source: "ios_release", status: "success", startedAt,
    finishedAt: new Date().toISOString(), stats: { state: result, provider: "codemagic", buildId } });
  console.log(JSON.stringify({ provider: "codemagic", buildId, result }, null, 2));
}

/** Codemagic is the explicit default to avoid unintended GitHub Actions minutes. */
export async function runIosReleaseCli(command: string, argv: string[]): Promise<void> {
  const args: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (["--build", "--apply", "--unsigned"].includes(key)) { flags.add(key); continue; }
    if (!["--slug", "--path", "--sha", "--build-name", "--build-number", "--provider", "--build-id"].includes(key) ||
        !argv[i + 1] || argv[i + 1].startsWith("--"))
      throw new Error("Invalid/missing iOS argument: " + key);
    args[key] = argv[++i];
  }
  if (flags.has("--unsigned") && (!flags.has("--build") || flags.has("--apply")))
    throw new Error("--unsigned requires --build and cannot be used with --apply.");
  if (flags.has("--apply") && !flags.has("--build") && command !== "ios-cancel")
    throw new Error("--apply requires --build; upload must be explicitly approved.");
  const provider = args["--provider"] ?? "codemagic";
  if (provider !== "codemagic" && provider !== "github")
    throw new Error("--provider must be codemagic or github.");
  if (args["--build-id"] && command === "ios")
    throw new Error("--build-id is only supported by ios-status and ios-cancel.");
  if (command === "ios-cancel" && (provider !== "codemagic" || !args["--build-id"]))
    throw new Error("ios-cancel requires --build-id and the codemagic provider.");

  const project = await resolveIosProject(await readProjects(), { slug: args["--slug"], path: args["--path"] });
  if (!project?.iosReleaseConfig) throw new Error("Project has no iosReleaseConfig. See docs/guide/ios-release-setup-handoff.md.");
  if (command === "ios-cancel") {
    await runIosCancel(project.id, args["--build-id"], flags.has("--apply"));
    return;
  }
  const config = project.iosReleaseConfig;
  if (project.appStoreTrackId !== config.appId)
    throw new Error("iosReleaseConfig.appId must match project.appStoreTrackId.");
  const app = await getAscApp(String(config.appId));
  if (app.bundleId !== config.bundleIds[0])
    throw new Error("ASC app bundle ID does not match the configured main bundle ID.");
  const builds = await listAscBuilds(String(config.appId));

  if (command === "ios-status") {
    const recentBuilds = [...builds].sort((a, b) => Date.parse(b.uploadedDate ?? "") - Date.parse(a.uploadedDate ?? ""))
      .slice(0, 10).map(({ id, version, processingState, uploadedDate }) => ({ id, version, processingState, uploadedDate }));
    console.log(JSON.stringify({ app, totalBuilds: builds.length, recentBuilds }, null, 2));
    if (provider === "codemagic") {
      const missing = ["CODEMAGIC_API_TOKEN", "CODEMAGIC_RUNNER_APP_ID"].filter((key) => !process.env[key]?.trim());
      if (missing.length) {
        console.log(JSON.stringify({ provider, configured: false, missing }, null, 2));
      } else if (args["--build-id"]) {
        const client = new CodemagicClient(codemagicRunnerFromEnv());
        console.log(JSON.stringify({ provider, build: await client.getBuild(args["--build-id"]) }, null, 2));
      } else {
        console.log("Specify --build-id <Codemagic build ID> to inspect runner status; Apple processing status is above.");
      }
    } else {
      const missing = ["OPENFINDABILITY_RELEASE_RUNNER_REPO", "OPENFINDABILITY_RELEASE_RUNNER_TOKEN"].filter((key) => !process.env[key]?.trim());
      if (missing.length) {
        console.log(JSON.stringify({ provider, configured: false, missing }, null, 2));
      } else {
        const github = new GitHubActionsClient(releaseRunnerFromEnv());
        await github.assertPrivate();
        console.log(JSON.stringify({ runs: (await github.runs()).filter((run) => run.display_title.startsWith("ios:" + project.slug + ":")) }, null, 2));
      }
    }
    console.log("Runner success is not TestFlight readiness. Confirm the exact build number is VALID on Apple and resolve compliance.");
    return;
  }

  const plan = planIosRelease({
    slug: project.slug, config, sha: args["--sha"] ?? "", buildName: args["--build-name"] ?? "",
    buildNumber: args["--build-number"], builds,
    mode: flags.has("--apply") ? "testflight" : flags.has("--unsigned") ? "unsigned" : flags.has("--build") ? "build" : "check",
  });
  console.log(JSON.stringify({ provider, plan }, null, 2));
  if (provider === "codemagic") {
    const policy = await readRunnerPolicy();
    const problems = [...codemagicPinProblems(config), ...(policy ? runnerPolicyProblems(plan, policy) : [])];
    if (!policy) console.log("No " + RUNNER_POLICY_PATH + ": the approved SHA is only checked on the runner.");
    if (problems.length) {
      console.log(JSON.stringify({ ready: false, problems }, null, 2));
      if (plan.mode !== "check") throw new Error("Codemagic setup is incomplete: no build dispatched.");
      process.exitCode = 1;
    }
  }
  if (plan.mode === "check") {
    console.log("Preflight only: no remote build and no CI minutes consumed.");
    return;
  }

  // Configuration errors surface here, before any intent is logged: nothing was dispatched.
  const codemagic = provider === "codemagic" ? new CodemagicClient(codemagicRunnerFromEnv()) : undefined;
  const github = provider === "github" ? new GitHubActionsClient(releaseRunnerFromEnv()) : undefined;
  await github?.assertPrivate();

  const correlationId = randomUUID();
  const startedAt = new Date().toISOString();
  // Persist intent BEFORE dispatch. On timeout never retry automatically.
  await appendConnectorRun({ id: createId("run"), projectId: project.id, source: "ios_release", status: "partial", startedAt,
    finishedAt: startedAt, stats: { state: "dispatching", provider, correlationId, plan } });
  try {
    const dispatch: unknown = codemagic
      ? await codemagic.dispatch(plan, correlationId)
      : await github!.dispatch(iosWorkflowInputs(plan, correlationId));
    await appendConnectorRun({ id: createId("run"), projectId: project.id, source: "ios_release", status: "success", startedAt,
      finishedAt: new Date().toISOString(), stats: { state: "dispatch_accepted", provider, correlationId, plan, dispatch } });
    console.log(JSON.stringify({ provider, correlationId, dispatch }, null, 2));
    console.log("Build queued, not necessarily compiled or uploaded. Check ios-status and App Store Connect.");
  } catch (error) {
    await appendConnectorRun({ id: createId("run"), projectId: project.id, source: "ios_release", status: "failed", startedAt,
      finishedAt: new Date().toISOString(), errorMessage: (error as Error).message,
      stats: { state: "dispatch_unknown_or_failed", provider, correlationId, plan } });
    throw new Error("Dispatch outcome may be ambiguous. Check " + provider + " for correlation ID " +
      correlationId + " before retrying. " + (error as Error).message);
  }
}
