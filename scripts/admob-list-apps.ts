import "dotenv/config";
import { google } from "googleapis";

async function main() {
  const clientId = process.env.ADMOB_CLIENT_ID?.trim();
  const clientSecret = process.env.ADMOB_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ADMOB_REFRESH_TOKEN?.trim();
  const publisherId = process.env.ADMOB_PUBLISHER_ID?.trim();

  if (!clientId || !clientSecret || !refreshToken || !publisherId) {
    throw new Error(
      "Set ADMOB_CLIENT_ID, ADMOB_CLIENT_SECRET, ADMOB_REFRESH_TOKEN and ADMOB_PUBLISHER_ID in .env before running this script.",
    );
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const admob = google.admob({ version: "v1", auth });
  const res = await admob.accounts.apps.list({ parent: `accounts/${publisherId}` });

  for (const app of res.data.apps ?? []) {
    console.log(`${app.appId}  ${app.platform}  ${app.manualAppInfo?.displayName ?? app.linkedAppInfo?.displayName ?? ""}`);
  }
  console.log(`\nTotal: ${res.data.apps?.length ?? 0} apps.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
