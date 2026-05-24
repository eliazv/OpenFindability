import { createDemoData } from "@/lib/demo";
import { buildOpportunities } from "@/lib/insights";
import { writeData } from "@/lib/store";

async function main() {
  const data = createDemoData();
  data.opportunities = buildOpportunities(data);
  await writeData(data);
  console.log(`Seeded ${data.projects.length} demo projects and ${data.opportunities.length} opportunities.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
