import "dotenv/config";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { google } from "googleapis";

const saFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();

async function main() {
  if (!saFile && !saJson) {
    console.error("No service account configured.");
    process.exit(1);
  }

  const filePath = saFile && !isAbsolute(saFile) ? join(process.cwd(), saFile) : saFile;
  const credentials = JSON.parse(saJson || (await readFile(filePath as string, "utf8")));

  console.log("Service account:", credentials.client_email);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  const publisher = google.androidpublisher({ version: "v3", auth });

  // Probe with a dummy package name — 404 = auth OK, 403 = no access or API not enabled
  try {
    await publisher.reviews.list({ packageName: "com.test.probe", maxResults: 1 });
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string; errors?: { message: string; reason: string }[] };
    if (e.code === 404) {
      console.log("✓ Auth works. API is enabled. Service account can reach Play Console.");
      console.log("  Next: set playConsolePackageName on a project and run pnpm sync:play-console");
    } else if (e.code === 403) {
      console.error("✗ 403 Forbidden.");
      console.error("  Likely causes:");
      console.error("  1. Google Play Android Developer API not enabled in Cloud Console");
      console.error("  2. Service account not linked in Play Console → Setup → API access");
      console.error("  Error:", e.message);
    } else if (e.code === 401) {
      console.error("✗ 401 Unauthorized — service account credentials invalid.");
    } else {
      console.error(`✗ Unexpected error (${e.code}):`, e.message);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
