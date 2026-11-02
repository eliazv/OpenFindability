import { randomUUID } from "node:crypto";
import { getAscApp, listAscApps, listAscBuilds } from "@/lib/connectors/appstoreconnect";
import { CodemagicClient, codemagicPinProblems, codemagicRunnerFromEnv } from "@/lib/connectors/codemagic";
import { GitHubActionsClient, releaseRunnerFromEnv } from "@/lib/connectors/github-actions";
import { iosWorkflowInputs, planIosRelease } from "@/lib/release-ios";
import { buildIosConfig, ensureCodemagicAccess, firebasePodProblem, flutterLockProblem, localMarketingVersion, podLockIsStale, resolvePushedSha } from "@/lib/release-ios-setup";
import { appendConnectorRun, readProjects, updateProject } from "@/lib/store";
import { createId } from "@/lib/id";
import { discoverLocalIosProjects, resolveIosProject } from "@/lib/release-ios-project";

async function localProject(path: string | undefined, bundleId: string) {
  if (!path) return undefined;
  return (await discoverLocalIosProjects(path)).find((local) => local.bundleIds.includes(bundleId));
}

/** With --apply: saves the project row, then adds the missing Codemagic secrets and a read-only GitHub deploy key. */
async function runIosSetup(args: Record<string, string>, apply: boolean): Promise<void> {
  if (!args["--path"]) throw new Error("ios-setup requires --path <app folder>.");
  const found = await discoverLocalIosProjects(args["--path"]);
  if (found.length !== 1) throw new Error(found.length ? "Several iOS apps here: point --path to the app subfolder." : "No Flutter/Capacitor iOS project at --path.");
  const [local] = found;
  const ascApp = (await listAscApps()).find((app) => app.bundleId && local.bundleIds.includes(app.bundleId));
  if (!ascApp) throw new Error("No App Store Connect app matches this folder's bundle IDs. Create it on App Store Connect first.");
  const projects = await readProjects();
  const project = args["--slug"]
    ? projects.find((candidate) => candidate.slug === args["--slug"])
    : projects.find((candidate) => candidate.appStoreTrackId === Number(ascApp.id));
  if (!project) throw new Error("No project for App Store app " + ascApp.id + ": add it with project:add, or pass --slug.");
  if (project.appStoreTrackId !== undefined && project.appStoreTrackId !== Number(ascApp.id))
    throw new Error("Project " + project.slug + " points to a different App Store app.");
  const config = await buildIosConfig(local, Number(ascApp.id), {
    xcode: args["--xcode"], flutter: args["--flutter"], node: args["--node"], webBuildScript: args["--web-script"], firebaseSdk: args["--firebase-sdk"],
  });
  console.log(JSON.stringify({ slug: project.slug, iosReleaseConfig: config }, null, 2));
  if (!apply) {
    console.log("Dry run: nothing saved. Check the values, then add --apply.");
    return;
  }
  await updateProject(project.slug, { iosReleaseConfig: config, appStoreTrackId: Number(ascApp.id) });
  const added = await ensureCodemagicAccess(new CodemagicClient(codemagicRunnerFromEnv()), project.slug, config.repository, local.path);
  console.log("Added on Codemagic: " + (added.join(", ") || "nothing, already configured"));
  console.log("Saved. Release it with: npx tsx scripts/release.ts ios --path <app folder>");
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
    if (["--build", "--apply", "--unsigned", "--wait", "--refresh-pods"].includes(key)) { flags.add(key); continue; }
    if (!["--slug", "--path", "--sha", "--build-name", "--build-number", "--provider", "--build-id", "--xcode", "--flutter", "--node", "--web-script", "--firebase-sdk"].includes(key) ||
        !argv[i + 1] || argv[i + 1].startsWith("--"))
      throw new Error("Invalid/missing iOS argument: " + key);
    args[key] = argv[++i];
  }
  if (flags.has("--unsigned") && (!flags.has("--build") || flags.has("--apply")))
    throw new Error("--unsigned requires --build and cannot be used with --apply.");
  if (flags.has("--apply") && !flags.has("--build") && command === "ios")
    throw new Error("--apply requires --build; upload must be explicitly approved.");
  if (command === "ios-setup") return runIosSetup(args, flags.has("--apply"));
  const provider = args["--provider"] ?? "codemagic";
  if (provider !== "codemagic" && provider !== "github")
    throw new Error("--provider must be codemagic or github.");
  if (args["--build-id"] && command === "ios")
    throw new Error("--build-id is only supported by ios-status and ios-cancel.");
  if ((command === "ios-cancel" || command === "ios-upload") && (provider !== "codemagic" || !args["--build-id"]))
    throw new Error(command + " requires --build-id and the codemagic provider.");

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

  if (command === "ios-upload") {
    const client = new CodemagicClient(codemagicRunnerFromEnv());
    const sourceBuildId = args["--build-id"];
    const release = await client.releaseReceipt(sourceBuildId);
    const uploadPlan = planIosRelease({ slug: project.slug, config, sha: release.sha, buildName: release.version,
      buildNumber: release.build, builds, mode: "testflight" });
    console.log(JSON.stringify({ sourceBuildId, sha: uploadPlan.sha, buildName: uploadPlan.buildName, buildNumber: uploadPlan.buildNumber }, null, 2));
    if (!flags.has("--apply")) {
      console.log("Dry run: nothing uploaded. Add --apply to upload this IPA without compiling again.");
      return;
    }
    const correlationId = randomUUID();
    const startedAt = new Date().toISOString();
    await appendConnectorRun({ id: createId("run"), projectId: project.id, source: "ios_release", status: "partial", startedAt,
      finishedAt: startedAt, stats: { state: "dispatching", provider, correlationId, plan: uploadPlan, sourceBuildId } });
    const dispatch = await client.dispatchUpload(uploadPlan, correlationId, sourceBuildId);
    await appendConnectorRun({ id: createId("run"), projectId: project.id, source: "ios_release", status: "success", startedAt,
      finishedAt: new Date().toISOString(), stats: { state: "dispatch_accepted", provider, correlationId, plan: uploadPlan, sourceBuildId, dispatch } });
    console.log(JSON.stringify({ provider, correlationId, dispatch }, null, 2));
    if (flags.has("--wait")) {
      const build = await client.waitForBuild(dispatch.buildId, { onStatus: (status) => console.log(new Date().toISOString() + " " + status) });
      console.log(JSON.stringify(build, null, 2));
      if (build.status !== "finished") {
        process.exitCode = 1;
        if (build.status === "failed") console.log(await client.failureSummary(dispatch.buildId));
      }
    }
    return;
  }

  const local = await localProject(args["--path"], config.bundleIds[0]);
  const sha = args["--sha"] ?? (local ? await resolvePushedSha(local.path, config.repository) : "");
  const buildName = args["--build-name"] ?? (local ? await localMarketingVersion(local) : undefined) ?? "";
  const plan = planIosRelease({
    slug: project.slug, config, sha, buildName,
    refreshPods: flags.has("--refresh-pods") || (local ? await podLockIsStale(local) : false),
    buildNumber: args["--build-number"], builds,
    mode: flags.has("--apply") ? "testflight" : flags.has("--unsigned") ? "unsigned" : flags.has("--build") ? "build" : "check",
  });
  console.log(JSON.stringify({ provider, plan }, null, 2));
  if (plan.refreshPods) console.log("Native pods will be resolved again: Podfile.lock is older than the dependency lockfile or --refresh-pods was passed. The new Podfile.lock is a build artifact, to commit in the app repository.");
  if (provider === "codemagic") {
    const localProblems = local
      ? [await flutterLockProblem(local, config.flutterVersion), await firebasePodProblem(local, config.firebaseSdkVersion)]
      : [];
    const problems = [...codemagicPinProblems(config), ...localProblems.filter((problem): problem is string => Boolean(problem))];
    if (problems.length) {
      console.log(JSON.stringify({ ready: false, problems }, null, 2));
      if (plan.mode !== "check") throw new Error("Codemagic setup is incomplete: no build dispatched.");
      process.exitCode = 1;
    }
  }
  if (plan.mode === "check") {
    console.log("Preflight only: no remote build and no CI minutes consumed. Add --build --unsigned, --build or --build --apply.");
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
    if (codemagic && flags.has("--wait")) {
      const { buildId } = dispatch as { buildId: string };
      const build = await codemagic.waitForBuild(buildId, { onStatus: (status) => console.log(new Date().toISOString() + " " + status) });
      console.log(JSON.stringify(build, null, 2));
      if (build.status !== "finished") {
        process.exitCode = 1;
        if (build.status === "failed") console.log(await codemagic.failureSummary(buildId));
      }
    }
  } catch (error) {
    await appendConnectorRun({ id: createId("run"), projectId: project.id, source: "ios_release", status: "failed", startedAt,
      finishedAt: new Date().toISOString(), errorMessage: (error as Error).message,
      stats: { state: "dispatch_unknown_or_failed", provider, correlationId, plan } });
    throw new Error("Dispatch outcome may be ambiguous. Check " + provider + " for correlation ID " +
      correlationId + " before retrying. " + (error as Error).message);
  }
}
