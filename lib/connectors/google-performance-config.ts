/** Dedicated keys take precedence; the shared Google Cloud key is an optional fallback. */
export function performanceApiKey(source: "crux" | "pagespeed"): string | undefined {
  const dedicated = source === "crux" ? process.env.CRUX_API_KEY : process.env.PAGESPEED_API_KEY;
  return dedicated?.trim() || process.env.GOOGLE_CLOUD_API_KEY_GOD?.trim() || undefined;
}
