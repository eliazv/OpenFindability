import "dotenv/config";
import { syncProjects } from "@/lib/sync";
import type { SourceType } from "@/lib/types";

async function main() {
  const arg = process.argv[2];
  const validSources: SourceType[] = ["gsc", "umami", "play_console", "aso", "revenuecat", "admob", "adsense"];
  const source = validSources.includes(arg as SourceType) ? (arg as SourceType) : undefined;
  // e.g. `pnpm run sync:admob -- 1500` backfills ~4 years instead of the default 30 days.
  const backfillArg = process.argv[3];
  const backfillDays = backfillArg ? Number(backfillArg) : undefined;
  const results = await syncProjects({ source, backfillDays });

  for (const result of results) {
    const inserted = result.inserted;
    const parts = [`${inserted.snapshots} snapshots`, `${inserted.queries} queries`, `${inserted.pages} pages`];
    if (inserted.keywords !== undefined) parts.push(`${inserted.keywords} keywords`);
    if (inserted.reviews !== undefined) parts.push(`${inserted.reviews} reviews`);
    console.log(`${result.status.toUpperCase()} ${result.source} ${result.projectId}: ${result.message} (${parts.join(", ")})`);
  }

  const failed = results.some((result) => result.status === "failed");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
