import "dotenv/config";
import { readData } from "@/lib/store";
import { getGrowthSnapshot } from "@/lib/analytics/growth-snapshot";

async function main() {
  const args = process.argv.slice(2).filter((part) => part !== "--");
  const slugIndex = args.indexOf("--slug");
  const daysIndex = args.indexOf("--days");
  const slug = slugIndex >= 0 ? args[slugIndex + 1] : undefined;
  const days = daysIndex >= 0 ? Number(args[daysIndex + 1]) : 28;
  if (!slug || ![7, 28, 90].includes(days)) {
    throw new Error("Usage: pnpm run growth:summary -- --slug <project-slug> [--days 7|28|90]");
  }
  const data = await readData();
  const project = data.projects.find((row) => row.slug === slug);
  if (!project) throw new Error(`Project "${slug}" not found.`);
  console.log(JSON.stringify(getGrowthSnapshot(data, project.id, days as 7 | 28 | 90), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
