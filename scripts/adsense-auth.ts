import "dotenv/config";
import { createServer } from "node:http";
import { google } from "googleapis";

const PORT = Number(process.env.ADSENSE_AUTH_PORT ?? 53683);
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ["https://www.googleapis.com/auth/adsense.readonly"];

async function main() {
  const clientId = process.env.ADSENSE_CLIENT_ID?.trim();
  const clientSecret = process.env.ADSENSE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Set ADSENSE_CLIENT_ID and ADSENSE_CLIENT_SECRET in .env before running this script.");
  }

  console.log("Run this on your own machine in a real browser session — it needs interactive Google login.");
  console.log("It will not work headless inside a remote/CI session.");
  console.log();

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("Open this URL and sign in with the Google account that owns the AdSense account:");
  console.log();
  console.log(authUrl);
  console.log();
  console.log(`Waiting for the OAuth redirect on ${REDIRECT_URI} ...`);

  const code = await waitForAuthCode(PORT);
  const { tokens } = await oauth2Client.getToken(code);

  console.log();
  if (!tokens.refresh_token) {
    console.log("Google did not return a refresh_token (it only issues one on first consent).");
    console.log("Revoke this app's access at https://myaccount.google.com/permissions and run this script again.");
    return;
  }

  console.log("Success. Add this to your .env:");
  console.log();
  console.log(`ADSENSE_REFRESH_TOKEN=${tokens.refresh_token}`);
}

function waitForAuthCode(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", `http://localhost:${port}`);
      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error");

      res.setHeader("Content-Type", "text/plain");

      if (error) {
        res.end(`Authorization failed: ${error}. You can close this tab.`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.end("Missing authorization code.");
        return;
      }

      res.end("Authorization complete. You can close this tab and return to the terminal.");
      server.close();
      resolve(code);
    });

    server.listen(port);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
