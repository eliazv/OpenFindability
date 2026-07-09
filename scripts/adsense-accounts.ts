import "dotenv/config";
import { google } from "googleapis";

async function main() {
  const clientId = process.env.ADSENSE_CLIENT_ID?.trim();
  const clientSecret = process.env.ADSENSE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ADSENSE_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Set ADSENSE_CLIENT_ID, ADSENSE_CLIENT_SECRET and ADSENSE_REFRESH_TOKEN in .env before running this script.");
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const adsense = google.adsense({ version: "v2", auth });
  const res = await adsense.accounts.list();

  for (const account of res.data.accounts ?? []) {
    console.log(`${account.name}  ${account.displayName ?? ""}  timezone=${account.timeZone?.id ?? "-"}`);
  }
  console.log(`\nTotal: ${res.data.accounts?.length ?? 0} account(s).`);
  console.log("\nUse the 'accounts/pub-...' id (without the 'accounts/' prefix) as ADSENSE_ACCOUNT_ID.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
