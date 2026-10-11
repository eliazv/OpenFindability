import "dotenv/config";
import { createDemoData } from "@/lib/demo";
import { buildOpportunities } from "@/lib/insights";
import { readData, updateData } from "@/lib/store";

async function main() {
  const existing = await readData();
  if (existing.projects.length > 0 && !process.argv.includes("--force")) {
    throw new Error("Demo seeding would replace existing analytics. Take a backup, then pass --force only if this is intentional.");
  }
  const data = createDemoData();
  data.opportunities = buildOpportunities(data);
  await updateData(() => data);
  console.log(`Seeded ${data.projects.length} demo projects and ${data.opportunities.length} opportunities.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
