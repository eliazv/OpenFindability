import "dotenv/config";
import { listAscApps } from "@/lib/connectors/appstoreconnect";

async function main() {
  const apps = await listAscApps();
  if (apps.length === 0) {
    console.log("No apps visible to this App Store Connect API key.");
    return;
  }

  for (const app of apps) {
    console.log(`${app.id}  ${app.bundleId ?? "?"}  ${app.name ?? ""}`);
  }
  console.log(`\nTotal: ${apps.length} apps.`);
  console.log('Set the matching project\'s "appStoreTrackId" to the numeric id on the left.');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
