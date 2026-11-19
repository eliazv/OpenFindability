import "dotenv/config";
import { syncProjects } from "@/lib/sync";
import type { SourceType } from "@/lib/types";
import { cliErrorMessage } from "@/lib/cli-error";

async function main() {
  const args = process.argv.slice(2);
  const projectIndex = args.indexOf("--project");
  let projectSlug: string | undefined;
  if (projectIndex >= 0) {
    projectSlug = args[projectIndex + 1];
    if (!projectSlug || projectSlug.startsWith("--")) throw new Error("--project requires a project slug.");
    args.splice(projectIndex, 2);
  }
  if (args.length > 2 || args.some(arg => arg.startsWith("--"))) throw new Error("Usage: sync.ts [source] [days] [--project slug]");
  const arg = args[0];
  const validSources: SourceType[] = [
    "ga4_landing",
    "bing_webmaster", "cloudflare_ai", "clarity",
    "gsc",
    "ga4",
    "umami",
    "play_console",
    "aso",
    "revenuecat",
    "admob",
    "adsense",
    "play_vitals",
    "play_stats",
    "asc_analytics",
  ];
  if (arg && !validSources.includes(arg as SourceType)) throw new Error(`Unknown source: ${arg}`);
  const source = validSources.includes(arg as SourceType) ? (arg as SourceType) : undefined;
  // e.g. `pnpm run sync:admob -- 1500` backfills ~4 years instead of the default 30 days.
  const backfillArg = args[1];
  const backfillDays = backfillArg ? Number(backfillArg) : undefined;
  if (backfillDays !== undefined && (!Number.isInteger(backfillDays) || backfillDays < 1)) throw new Error("days must be a positive integer.");
  const results = await syncProjects({ source, backfillDays, projectSlug });

  for (const result of results) {
    const inserted = result.inserted;
    const parts = [`${inserted.snapshots} snapshots`, `${inserted.queries} queries`, `${inserted.pages} pages`];
    if (inserted.keywords !== undefined) parts.push(`${inserted.keywords} keywords`);
    if (inserted.reviews !== undefined) parts.push(`${inserted.reviews} reviews`);
    if (inserted.observations !== undefined) parts.push(`${inserted.observations} observations`);
    console.log(`${result.status.toUpperCase()} ${result.source} ${result.projectId}: ${result.message} (${parts.join(", ")})`);
  }

  const failed = results.some((result) => result.status === "failed");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(cliErrorMessage(error));
  process.exit(1);
});
