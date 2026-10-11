import "dotenv/config";
import { readData } from "@/lib/store";
import { listPlayTrackStatus } from "@/lib/connectors/play-console";
import { listAppStoreVersionStatus } from "@/lib/connectors/appstoreconnect";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const i = args.indexOf("--slug");
  const slug = i >= 0 ? args[i + 1] : undefined;
  if (!slug) throw new Error("Usage: pnpm run store:status -- --slug <project-slug> [--json]");

  const data = await readData();
  const project = data.projects.find((p) => p.slug === slug);
  if (!project) throw new Error(`Unknown project: ${slug}`);
  if (!project.playConsolePackageName && !project.appStoreTrackId) {
    throw new Error(`Project ${slug} has no Play package or Apple app ID.`);
  }

  const checkedAt = new Date().toISOString();
  const output: {
    project: string;
    checkedAt: string;
    googlePlay?: Awaited<ReturnType<typeof listPlayTrackStatus>>;
    appStore?: Awaited<ReturnType<typeof listAppStoreVersionStatus>>;
    errors: string[];
  } = { project: project.slug, checkedAt, errors: [] };

  if (project.playConsolePackageName) {
    try {
      output.googlePlay = await listPlayTrackStatus(project.playConsolePackageName);
    } catch (error) {
      output.errors.push(`Google Play: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (project.appStoreTrackId) {
    try {
      output.appStore = await listAppStoreVersionStatus(String(project.appStoreTrackId));
    } catch (error) {
      output.errors.push(`App Store: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`Store release status — ${project.name} — checked ${checkedAt}`);
    for (const track of output.googlePlay ?? []) {
      for (const release of track.releases) {
        console.log(`Play ${track.track}: ${release.name ?? "unnamed"} | ${release.status ?? "unknown"} | codes ${release.versionCodes.join(",")}${release.rolloutFraction !== undefined ? ` | rollout ${(release.rolloutFraction * 100).toFixed(1)}%` : ""}`);
      }
    }
    for (const version of output.appStore ?? []) {
      console.log(`Apple ${version.platform ?? "iOS"}: ${version.versionString ?? "unknown"} | ${version.state ?? "unknown"}`);
    }
    for (const error of output.errors) console.error(error);
    console.log("Read-only status: this does not upload builds or publish releases.");
  }
  if (output.errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
