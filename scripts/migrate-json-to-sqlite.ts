import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readData, updateData } from "@/lib/store";
import type { AppData } from "@/lib/types";

const legacyJsonPath = path.join(process.cwd(), "data", "openfindability.json");

async function main() {
  const raw = await readFile(legacyJsonPath, "utf8");
  const data = JSON.parse(raw) as AppData;
  data.gscIndexInspections ??= [];

  const current = await readData();
  if (current.projects.length > 0 && !process.argv.includes("--force")) {
    throw new Error("Database already contains projects. Create a backup and rerun with --force to replace it intentionally.");
  }
  await updateData(() => data);

  console.log(`Migrated ${data.projects.length} projects from ${legacyJsonPath} into SQLite.`);
  console.log("You can now remove the legacy data/openfindability.json file.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
