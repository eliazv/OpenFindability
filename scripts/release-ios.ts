import { randomUUID } from "node:crypto";
import { getAscApp, listAscBuilds } from "@/lib/connectors/appstoreconnect";
import { GitHubActionsClient, releaseRunnerFromEnv } from "@/lib/connectors/github-actions";
import { iosWorkflowInputs, planIosRelease } from "@/lib/release-ios";
import { appendConnectorRun, readProjects } from "@/lib/store";
import { createId } from "@/lib/id";
import { resolveIosProject } from "@/lib/release-ios-project";

export async function runIosReleaseCli(command: string, argv: string[]): Promise<void> {
  const args: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (["--build", "--apply", "--unsigned"].includes(key)) { flags.add(key); continue; }
    if (!["--slug", "--path", "--sha", "--build-name", "--build-number"].includes(key) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Invalid/missing iOS argument: ${key}`);
    args[key] = argv[++i];
  }
  if (flags.has("--unsigned") && (!flags.has("--build") || flags.has("--apply"))) throw new Error("--unsigned requires --build and cannot be used with --apply.");
  const project = await resolveIosProject(await readProjects(), { slug: args["--slug"], path: args["--path"] });
  if (!project?.iosReleaseConfig) throw new Error("Project has no iosReleaseConfig. See docs/guide/ios-release-setup-handoff.md.");
  const config = project.iosReleaseConfig;
  if (project.appStoreTrackId !== config.appId) throw new Error("iosReleaseConfig.appId must match project.appStoreTrackId.");
  const app = await getAscApp(String(config.appId));
  if (app.bundleId !== config.bundleIds[0]) throw new Error("ASC app bundle ID does not match the configured main bundle ID.");
  const builds = await listAscBuilds(String(config.appId));
  if (command === "ios-status") {
    const recentBuilds = [...builds].sort((a, b) => Date.parse(b.uploadedDate ?? "") - Date.parse(a.uploadedDate ?? ""))
      .slice(0, 10).map(({ id, version, processingState, uploadedDate }) => ({ id, version, processingState, uploadedDate }));
    console.log(JSON.stringify({ app, totalBuilds: builds.length, recentBuilds }, null, 2));
    const missing = ["OPENFINDABILITY_RELEASE_RUNNER_REPO", "OPENFINDABILITY_RELEASE_RUNNER_TOKEN"].filter((key) => !process.env[key]?.trim());
    if (missing.length > 0) {
      console.log(JSON.stringify({ runner: { configured: false, missing }, note: "Apple status available; finish private GitHub runner setup to read job status." }, null, 2));
      return;
    }
    const github = new GitHubActionsClient(releaseRunnerFromEnv());
    await github.assertPrivate();
    console.log(JSON.stringify({ runs: (await github.runs()).filter((run) => run.display_title.startsWith(`ios:${project.slug}:`)) }, null, 2));
    console.log("GitHub success alone does not confirm TestFlight readiness. Check the matching version/build and ASC processingState (VALID), then tester availability in Apple UI.");
    return;
  }
  const plan = planIosRelease({ slug: project.slug, config, sha: args["--sha"] ?? "", buildName: args["--build-name"] ?? "", buildNumber: args["--build-number"], builds,
    mode: flags.has("--apply") ? "testflight" : flags.has("--unsigned") ? "unsigned" : flags.has("--build") ? "build" : "check" });
  console.log(JSON.stringify(plan, null, 2));
  if (plan.mode === "check") { console.log("Preflight only: no workflow dispatched, no history written."); return; }
  const github = new GitHubActionsClient(releaseRunnerFromEnv());
  await github.assertPrivate();
  const correlationId = randomUUID();
  const startedAt = new Date().toISOString();
  // Persist intent BEFORE the external request. On timeout do not retry automatically.
  await appendConnectorRun({ id: createId("run"), projectId: project.id, source: "ios_release", status: "success", startedAt,
    finishedAt: startedAt, stats: { state: "dispatching", correlationId, plan } });
  try {
    const response = await github.dispatch(iosWorkflowInputs(plan, correlationId));
    await appendConnectorRun({ id: createId("run"), projectId: project.id, source: "ios_release", status: "success", startedAt,
      finishedAt: new Date().toISOString(), stats: { state: "dispatch_accepted", correlationId, plan, rawJson: response } });
    console.log(JSON.stringify({ correlationId, dispatch: response ?? "Accepted without run details; locate correlation ID in ios-status." }, null, 2));
    console.log("Dispatch accepted; build/upload/processing are not yet confirmed. Use ios-status and the GitHub run URL.");
  } catch (error) {
    await appendConnectorRun({ id: createId("run"), projectId: project.id, source: "ios_release", status: "failed", startedAt,
      finishedAt: new Date().toISOString(), errorMessage: (error as Error).message, stats: { state: "dispatch_unknown_or_failed", correlationId, plan } });
    throw new Error(`Dispatch outcome may be ambiguous. Check ios-status for ${correlationId} before retrying. ${(error as Error).message}`);
  }
}
