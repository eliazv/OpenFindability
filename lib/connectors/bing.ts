import { createId } from "@/lib/id";
import type { MetricSnapshot, Project, SeoGeoObservation } from "@/lib/types";
import { fetchJson, finite, imported, observation } from "./seo-geo-common";

type BingRow = Record<string, unknown>;
export async function bingRead(method: "GetUserSites" | "GetRankAndTrafficStats" | "GetQueryStats" | "GetPageStats", siteUrl?: string): Promise<BingRow[]> {
  const key = process.env.BING_WEBMASTER_API_KEY;
  if (!key) throw new Error("BING_WEBMASTER_API_KEY is not configured.");
  const url = new URL(`https://ssl.bing.com/webmaster/api.svc/json/${method}`);
  url.searchParams.set("apikey", key);
  if (siteUrl) url.searchParams.set("siteUrl", siteUrl);
  const body = await fetchJson(url) as { d?: unknown; ErrorCode?: unknown };
  if (!Array.isArray(body.d)) throw new Error(`Bing ${method} returned an unexpected response.`);
  return body.d as BingRow[];
}

// Microsoft dates encode epoch milliseconds plus the reporting UTC offset.
export function bingDate(value: unknown): string {
  if (typeof value !== "string") throw new Error("Bing row has no reporting date.");
  const match = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(value);
  if (match) {
    const offset = match[2];
    const minutes = offset ? (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5))) * (offset[0] === "-" ? -1 : 1) : 0;
    return new Date(Number(match[1]) + minutes * 60000).toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid Bing date.");
  return value.slice(0, 10);
}

export function parseBingRows(project: Project, kind: "daily" | "query" | "page", rows: BingRow[], fetchedAt: string, startDate: string, endDate: string) {
  const snapshots: MetricSnapshot[] = [];
  const observations: SeoGeoObservation[] = [];
  for (const rawJson of rows) {
    const date = bingDate(rawJson.Date);
    if (date < startDate || date > endDate) continue;
    const clicks = finite(rawJson.Clicks), impressions = finite(rawJson.Impressions);
    if (clicks === undefined || impressions === undefined || clicks < 0 || impressions < 0) throw new Error("Bing returned invalid traffic counts.");
    const scope = kind === "daily" ? project.bingSiteUrl! : String(kind === "query" ? rawJson.Query ?? "" : rawJson.Query ?? rawJson.Page ?? rawJson.Url ?? "");
    if (!scope) throw new Error("Bing detail has no query/page dimension.");
    const metrics = { clicks, impressions, ctr: impressions ? clicks / impressions : null, avgPosition: finite(rawJson.AvgImpressionPosition) ?? null };
    observations.push(observation({ projectId: project.id, source: "bing_webmaster", kind, windowStart: date, windowEnd: date,
      grain: kind === "daily" ? "day" : "provider_period", scope, metrics, fetchedAt, rawJson,
      coverage: { siteUrl: project.bingSiteUrl, dateMeaning: kind === "daily" ? "reporting_day" : "provider_report_date; interval not inferred", inventory: "provider_top_rows", timezone: "provider_offset" },
    }));
    if (kind === "daily") snapshots.push({ id: createId("metric"), projectId: project.id, source: "bing_webmaster", date, clicks, impressions, ctr: impressions ? clicks / impressions : undefined, rawJson, createdAt: fetchedAt });
  }
  return { snapshots, observations };
}

export async function syncBingProject(project: Project, startDate: string, endDate: string) {
  if (!project.bingSiteUrl || !process.env.BING_WEBMASTER_API_KEY) return imported("bing_webmaster", project.id, [], [], "Bing site URL or credentials not configured.", "skipped");
  const fetchedAt = new Date().toISOString();
  const daily = parseBingRows(project, "daily", await bingRead("GetRankAndTrafficStats", project.bingSiteUrl), fetchedAt, startDate, endDate);
  const observations = [...daily.observations];
  const unavailable: string[] = [];
  for (const [kind, method] of [["query", "GetQueryStats"], ["page", "GetPageStats"]] as const) {
    try { observations.push(...parseBingRows(project, kind, await bingRead(method, project.bingSiteUrl), fetchedAt, startDate, endDate).observations); }
    catch (error) { unavailable.push(`${kind}: ${error instanceof Error ? error.message : "unavailable"}`); }
  }
  return imported("bing_webmaster", project.id, observations, daily.snapshots,
    unavailable.length ? `Daily totals imported; details incomplete: ${unavailable.join("; ")}` : undefined, unavailable.length ? "partial" : undefined);
}
