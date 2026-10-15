import type { Project } from "@/lib/types";
import { fetchJson, hostOf, imported, observation } from "./seo-geo-common";

export type ClarityMetric = { metricName: string; information: Record<string, unknown>[] };
export async function clarityRead(tokenEnv = "MICROSOFT_CLARITY_TOKEN"): Promise<ClarityMetric[]> {
  const token = process.env[tokenEnv];
  if (!token) throw new Error(`${tokenEnv} is not configured.`);
  const body = await fetchJson("https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1&dimension1=URL", { headers: { Authorization: `Bearer ${token}` } }, 1);
  if (!Array.isArray(body) || body.some(m => typeof m.metricName !== "string" || !Array.isArray(m.information))) throw new Error("Clarity returned an unexpected response.");
  return body as ClarityMetric[];
}

export function parseClarity(project: Project, payload: ClarityMetric[], fetchedAt: string) {
  const end = new Date(fetchedAt).toISOString();
  const start = new Date(Date.parse(end) - 86400000).toISOString();
  const expected = hostOf(project.websiteUrl)?.replace(/^www\./, "");
  if (!expected) throw new Error("Clarity mapping requires a project website URL.");
  const rows = payload.flatMap(metric => metric.information.map((rawJson) => ({ metric: metric.metricName, rawJson })));
  // Token is project-scoped. Never attach unrelated domains to a local project.
  const matching = rows.filter(r => hostOf(String(r.rawJson.Url ?? r.rawJson.URL ?? ""))?.replace(/^www\./, "") === expected);
  return matching.map(({ metric, rawJson }) => {
    const { Url, URL, ...metrics } = rawJson;
    return observation({ projectId: project.id, source: "clarity", kind: metric, grain: "rolling_window",
      windowStart: start, windowEnd: end, scope: String(Url ?? URL), metrics,
      coverage: { timezone: "UTC", windowApproximate: true, numOfDays: 1, overlapping: true, topRowsOnly: true, rowLimit: 1000, possiblyTruncated: payload.some(m => m.information.length >= 1000) }, rawJson, fetchedAt,
    });
  });
}

export async function syncClarityProject(project: Project) {
  if (!project.clarityTokenEnv) return imported("clarity", project.id, [], [], "Project has no Clarity token mapping.", "skipped");
  const fetchedAt = new Date().toISOString();
  const payload = await clarityRead(project.clarityTokenEnv);
  const rows = parseClarity(project, payload, fetchedAt);
  const capped = payload.some(metric => metric.information.length >= 1000);
  return imported("clarity", project.id, rows, [], `${rows.length} per-URL UX observations over last 24h (rolling; do not sum overlapping exports).${capped ? " Provider row cap reached." : ""}`, capped ? "partial" : undefined);
}
