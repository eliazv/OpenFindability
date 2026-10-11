import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getPlayTracks, type PlayReleaseStatus } from "@/lib/connectors/play-console";
import { createId } from "@/lib/id";
import { readFlutterProject, releaseAndroid, type ReleaseMode } from "@/lib/release";
import { readData, updateData } from "@/lib/store";
import type { Project } from "@/lib/types";

type Args = {
  slug?: string;
  path?: string;
  track: string;
  status?: string;
  rollout?: string;
  notes?: string;
  notesFile?: string;
  notesLanguage?: string;
  buildName?: string;
  buildNumber?: string;
  flavor?: string;
  aab?: string;
  build: boolean;
  apply: boolean;
};

const STATUSES: PlayReleaseStatus[] = ["completed", "draft", "inProgress", "halted"];

const USAGE =
  "Usage:\n" +
  "  pnpm run release:status -- --slug <slug>\n" +
  "  pnpm run release:android -- --slug <slug> [--path <flutter project dir>] [--track internal|alpha|beta|production]\n" +
  "      [--build-number <n|auto>] [--build-name 1.2.3] [--flavor <flavor>] [--aab <prebuilt.aab>]\n" +
  "      [--notes \"...\" | --notes-file notes.txt] [--notes-language it-IT]\n" +
  "      [--status completed|draft|inProgress|halted] [--rollout 0.2] [--build] [--apply]\n\n" +
  "Default is a preflight check only. --build also builds and verifies the bundle; --apply builds, uploads and commits.";

function parseArgs(argv: string[]): Args {
  const args: Args = { track: "internal", build: false, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    switch (key) {
      case "slug": args.slug = value; i += 1; break;
      case "path": args.path = value; i += 1; break;
      case "track": args.track = value; i += 1; break;
      case "status": args.status = value; i += 1; break;
      case "rollout": args.rollout = value; i += 1; break;
      case "notes": args.notes = value; i += 1; break;
      case "notes-file": args.notesFile = value; i += 1; break;
      case "notes-language": args.notesLanguage = value; i += 1; break;
      case "build-name": args.buildName = value; i += 1; break;
      case "build-number": args.buildNumber = value; i += 1; break;
      case "flavor": args.flavor = value; i += 1; break;
      case "aab": args.aab = value; i += 1; break;
      case "build": args.build = true; break;
      case "apply": args.apply = true; break;
      default:
        throw new Error(`Unknown argument --${key}\n\n${USAGE}`);
    }
  }
  return args;
}

// --slug wins; otherwise match the Flutter project at --path by its applicationId, so
// "release the app in this folder" works without knowing the OpenFindability slug.
async function resolveProject(projects: Project[], args: Args): Promise<Project> {
  if (args.slug) {
    const project = projects.find((p) => p.slug === args.slug);
    if (!project) {
      throw new Error(`No project found with slug "${args.slug}". Configured slugs: ${projects.map((p) => p.slug).join(", ")}`);
    }
    return project;
  }
  if (!args.path) throw new Error(`--slug or --path is required.\n\n${USAGE}`);

  const { applicationId } = await readFlutterProject(resolve(args.path));
  const project = projects.find((p) => applicationId && p.playConsolePackageName === applicationId);
  if (!project) {
    throw new Error(`No project has playConsolePackageName "${applicationId ?? "(not found in build.gradle)"}". Pass --slug.`);
  }
  return project;
}

async function printStatus(project: Project, packageName: string) {
  const tracks = await getPlayTracks(packageName);
  console.log(`Play tracks for "${project.slug}" (${packageName}):\n`);
  for (const track of tracks) {
    if (track.releases.length === 0) {
      console.log(`  ${track.track}: (no releases)`);
      continue;
    }
    for (const release of track.releases) {
      const rollout = release.userFraction !== undefined ? ` ${Math.round(release.userFraction * 100)}%` : "";
      console.log(`  ${track.track}: ${release.name ?? "(unnamed)"} — codes ${release.versionCodes.join(", ") || "-"} — ${release.status}${rollout}`);
    }
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2).filter((token) => token !== "--");
  if (command !== "android" && command !== "status") throw new Error(USAGE);
  const args = parseArgs(rest);

  const data = await readData();
  const project = await resolveProject(data.projects, args);
  if (!project.playConsolePackageName) {
    throw new Error(`Project "${project.slug}" has no playConsolePackageName configured.`);
  }
  const packageName = project.playConsolePackageName;

  if (command === "status") {
    await printStatus(project, packageName);
    return;
  }

  const projectPath = args.path ?? project.flutterProjectPath;
  if (!projectPath) {
    throw new Error(
      `No Flutter project path for "${project.slug}". Pass --path, or save it once with ` +
        `\`pnpm run project:update -- --slug ${project.slug} --flutter-path <dir>\`.`,
    );
  }
  if (args.status && !STATUSES.includes(args.status as PlayReleaseStatus)) {
    throw new Error(`--status must be one of ${STATUSES.join(", ")}.`);
  }
  if (args.buildNumber && args.buildNumber !== "auto" && !/^\d+$/.test(args.buildNumber)) {
    throw new Error("--build-number must be a positive integer or \"auto\".");
  }

  const mode: ReleaseMode = args.apply ? "apply" : args.build ? "build" : "check";
  const notes = args.notesFile ? (await readFile(args.notesFile, "utf8")).trim() : args.notes;
  const startedAt = new Date().toISOString();

  try {
    const result = await releaseAndroid({
      projectPath,
      packageName,
      track: args.track,
      mode,
      status: args.status as PlayReleaseStatus | undefined,
      userFraction: args.rollout ? Number(args.rollout) : undefined,
      releaseNotes: notes,
      releaseNotesLanguage: args.notesLanguage,
      buildName: args.buildName,
      buildNumber: args.buildNumber === "auto" ? "auto" : args.buildNumber ? Number(args.buildNumber) : undefined,
      flavor: args.flavor,
      aabPath: args.aab,
      signingPropertiesFile: join(process.cwd(), "secrets", "android", project.slug, "key.properties"),
      log: (line) => console.log(line),
      onBuildOutput: (chunk) => process.stdout.write(chunk),
    });

    console.log(`\nRelease ${mode === "apply" ? "(APPLIED)" : mode === "build" ? "(build only)" : "(preflight only)"} for "${project.slug}":\n`);
    console.log(`  package:      ${result.packageName}`);
    console.log(`  version:      ${result.versionName || "?"} (code ${result.versionCode || "from bundle"})`);
    console.log(`  highest live: ${result.highestPlayVersionCode}`);
    console.log(`  track:        ${result.track} (${result.status})`);
    console.log(`  signing:      ${result.signing === "central" ? `central (secrets/android/${project.slug}/key.properties)` : "Flutter project's own Gradle config"}`);
    if (result.signer) console.log(`  signer:       ${result.signer}`);
    if (result.aabPath) console.log(`  bundle:       ${result.aabPath} (${((result.aabSizeBytes ?? 0) / 1024 / 1024).toFixed(1)} MB)`);
    for (const warning of result.warnings) console.log(`  WARNING:      ${warning}`);

    if (mode === "check") {
      console.log("\nPreflight only — nothing was built or uploaded. Re-run with --build to build, or --apply to build and publish.");
      return;
    }

    await recordRun(project.id, startedAt, "success", undefined, {
      mode,
      track: result.track,
      status: result.status,
      versionName: result.versionName,
      versionCode: result.versionCode,
      uploaded: result.uploaded,
      rawJson: result.rawJson,
    });

    console.log(
      result.uploaded
        ? `\nUploaded version code ${result.versionCode} to "${result.track}".`
        : "\nBuilt and verified — nothing was uploaded. Re-run with --apply (add --aab <bundle> to reuse this build).",
    );
  } catch (error) {
    if (mode !== "check") {
      await recordRun(project.id, startedAt, "failed", (error as Error).message, { mode, track: args.track });
    }
    throw error;
  }
}

async function recordRun(
  projectId: string,
  startedAt: string,
  status: "success" | "failed",
  errorMessage: string | undefined,
  stats: Record<string, unknown>,
) {
  await updateData((d) => {
    d.connectorRuns.push({
      id: createId("run"),
      source: "play_release",
      projectId,
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      errorMessage,
      stats,
    });
  });
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
