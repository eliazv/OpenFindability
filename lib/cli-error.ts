/** Provider error objects may include OAuth request bodies. Never print the object. */
export function cliErrorMessage(error: unknown, env: NodeJS.ProcessEnv = process.env): string {
  const message = error instanceof Error ? error.message : "Command failed.";
  if (message === "invalid_grant") {
    return "Google authorization expired or was revoked. Run the account's auth helper again in your browser.";
  }
  let safe = message;
  for (const [key, value] of Object.entries(env)) {
    if (/token|key|secret|password/i.test(key) && value && value.length > 6) safe = safe.split(value).join("[REDACTED]");
  }
  return safe;
}
