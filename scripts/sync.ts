import "dotenv/config";
import { syncProjects } from "@/lib/sync";
import type { SourceType } from "@/lib/types";

async function main() {
  const arg = process.argv[2];
  const validSources: SourceType[] = ["gsc", "umami", "play_console", "aso"];
  const source = validSources.includes(arg as SourceType) ? (arg as SourceType) : undefined;
  const results = await syncProjects({ source });

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
