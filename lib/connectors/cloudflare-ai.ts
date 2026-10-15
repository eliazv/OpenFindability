import type { Project } from "@/lib/types";
import { fetchJson, hostOf, imported, observation, type SeoGeoImport } from "./seo-geo-common";

export function cloudflareToken() { return process.env.CLOUDFLARE_API_TOKEN_2 || process.env.CLOUDFLARE_API_TOKEN; }
export async function cloudflareZones(): Promise<{ id: string; name: string; status: string }[]> {
  const zones: { id: string; name: string; status: string }[] = [];
  for (let page = 1; ; page++) {
    const body = await fetchJson(`https://api.cloudflare.com/client/v4/zones?per_page=50&page=${page}`, { headers: { Authorization: `Bearer ${cloudflareToken()}` } }) as { success: boolean; result: typeof zones; result_info?: { total_pages?: number } };
    if (!body.success || !Array.isArray(body.result)) throw new Error("Cloudflare zones unavailable; verify Zone Read permission.");
    zones.push(...body.result);
    if (page >= (body.result_info?.total_pages ?? 1)) break;
  }
  return zones;
}

export const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "CCBot", "Bytespider", "Amazonbot"];
type Group = { count: number; dimensions: { datetimeHour: string; userAgent: string; clientRequestHTTPHost: string; clientRequestPath: string; edgeResponseStatus: number }; avg?: { sampleInterval?: number } };

export async function syncCloudflareProject(project: Project): Promise<SeoGeoImport> {
  if (!project.cloudflareZoneId || !cloudflareToken()) return imported("cloudflare_ai", project.id, [], [], "Cloudflare zone or credentials not configured.", "skipped");
  // One completed UTC hour at a time; last 23 hours fit Free's rolling 24h retention.
  const end = new Date(); end.setUTCMinutes(0, 0, 0);
  const start = new Date(end.getTime() - 23 * 3600000);
  const query = `query($zone: String!, $start: Time!, $end: Time!) { viewer { zones(filter: {zoneTag: $zone}) {
    httpRequestsAdaptiveGroups(limit: 10000, orderBy: [count_DESC], filter: {
      datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball",
      OR: [${AI_CRAWLERS.map(c => `{userAgent_like: "%${c}%"}`).join(",")}]
    }) { count avg { sampleInterval } dimensions { datetimeHour userAgent clientRequestHTTPHost clientRequestPath edgeResponseStatus } }
  } } }`;
  const body = await fetchJson("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST", headers: { Authorization: `Bearer ${cloudflareToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { zone: project.cloudflareZoneId, start: start.toISOString(), end: end.toISOString() } }),
  }) as { errors?: { message: string }[]; data?: { viewer?: { zones?: { httpRequestsAdaptiveGroups?: Group[] }[] } } };
  if (body.errors?.length) throw new Error(`Cloudflare analytics unavailable: ${body.errors.map(e => e.message).join("; ").slice(0, 500)}`);
  const rows = body.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups;
  if (!rows) throw new Error("Cloudflare returned no accessible analytics zone.");
  const fetchedAt = new Date().toISOString();
  const host = hostOf(project.websiteUrl)?.replace(/^www\./, "");
  if (!host) throw new Error("Cloudflare mapping requires a website URL.");
  const matching = rows.filter(r => r.dimensions.clientRequestHTTPHost.toLowerCase().replace(/^www\./, "") === host);
  const observations = matching.map(rawJson => {
    const d = rawJson.dimensions;
    const hourStart = new Date(d.datetimeHour).toISOString();
    return observation({ projectId: project.id, source: "cloudflare_ai", kind: "crawler_requests", grain: "hour",
      windowStart: hourStart, windowEnd: new Date(Date.parse(hourStart) + 3600000).toISOString(),
      scope: JSON.stringify([d.userAgent, d.clientRequestHTTPHost, d.clientRequestPath, d.edgeResponseStatus]),
      metrics: { crawler: AI_CRAWLERS.find(c => d.userAgent.toLowerCase().includes(c.toLowerCase())) ?? "unknown", requests: rawJson.count, host: d.clientRequestHTTPHost, path: d.clientRequestPath, httpStatus: d.edgeResponseStatus },
      coverage: { zoneId: project.cloudflareZoneId, detectionMethod: "user_agent", sampled: true, sampleInterval: rawJson.avg?.sampleInterval ?? null, queryStart: start.toISOString(), queryEnd: end.toISOString(), truncated: rows.length >= 10000, proxyOnly: true },
      rawJson, fetchedAt,
    });
  });
  // Preserve coverage even when no matching crawlers were returned. This is not proof
  // of zero origin traffic: analytics cover only Cloudflare-proxied requests.
  observations.push(observation({ projectId: project.id, source: "cloudflare_ai", kind: "coverage", grain: "provider_period",
    windowStart: start.toISOString(), windowEnd: end.toISOString(), scope: host, metrics: { returnedGroups: matching.length },
    coverage: { proxyOnly: true, detectionMethod: "user_agent", sampled: true, truncated: rows.length >= 10000 }, rawJson: { returnedGroups: matching.length }, fetchedAt }));
  const result = imported("cloudflare_ai", project.id, observations, [], `${matching.length} crawler groups, last 23 completed UTC hours; user-agent detection, proxied requests only.`, rows.length >= 10000 ? "partial" : "success");
  if (rows.length < 10000) result.replaceWindow = { start: start.toISOString(), end: end.toISOString(), kind: "crawler_requests" };
  return result;
}
