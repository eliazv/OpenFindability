import "dotenv/config";
import { readData } from "@/lib/store";
import { buildSheetProjection, exportGoogleSheet } from "@/lib/integrations/sheets-export";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const daysIndex = args.indexOf("--days");
  const days = daysIndex >= 0 ? Number(args[daysIndex + 1]) : 90;
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("Use --days 1..365 (default 90).");
  }
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const data = await readData();
  const preview = buildSheetProjection(data, new Date(), days);
  console.log("Google Sheets read-only analytics projection:");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(preview).map(([tab, rows]) => [tab, rows.length])), null, 2));
  if (!apply) {
    console.log("DRY RUN. No spreadsheet was modified. Use --apply when the private sheet is configured.");
    return;
  }
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set.");
  await exportGoogleSheet(data, sheetId, days);
  console.log("Private Google Sheet updated with OpenFindability-owned OF_ tabs; GSC Apps Script tabs untouched.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
