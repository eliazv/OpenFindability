import { syncProjects } from "@/lib/sync";
import type { SourceType } from "@/lib/types";

async function main() {
  const arg = process.argv[2];
  const source = arg === "gsc" || arg === "umami" ? (arg as SourceType) : undefined;
  const results = await syncProjects({ source });

  for (const result of results) {
    console.log(
      `${result.status.toUpperCase()} ${result.source} ${result.projectId}: ${result.message} (${result.inserted.snapshots} snapshots, ${result.inserted.queries} queries, ${result.inserted.pages} pages)`,
    );
  }

  const failed = results.some((result) => result.status === "failed");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
