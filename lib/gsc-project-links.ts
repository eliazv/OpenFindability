import type { AppData, Project } from "@/lib/types";

function propertyKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("sc-domain:")) return `sc-domain:${trimmed.slice(10).toLowerCase().replace(/\.$/, "")}`;
  try { return new URL(trimmed).toString(); } catch { return trimmed; }
}

export function resolveGscProject(projects: Project[], siteUrl: string): Project | undefined {
  const key = propertyKey(siteUrl);
  const explicit = projects.filter(p => p.gscProperty && propertyKey(p.gscProperty) === key);
  if (explicit.length) return explicit.length === 1 ? explicit[0] : undefined;
  if (!key.startsWith("sc-domain:")) return undefined;
  // Only an exact domain (or www variant) can suggest a missing mapping. Do not
  // bind every app/subdomain covered by a broad domain property to one project.
  const matches = projects.filter(p => {
    if (p.gscProperty || !p.websiteUrl) return false;
    try { return new URL(p.websiteUrl).hostname.replace(/^www\./, "").toLowerCase() === key.slice(10).replace(/^www\./, ""); }
    catch { return false; }
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function reconcileGscProjectLinks(data: Pick<AppData, "projects" | "gscIndexInspections" | "connectorRuns">) {
  let inspections = 0, runs = 0;
  for (const row of data.gscIndexInspections) {
    if (row.projectId) continue;
    const project = resolveGscProject(data.projects, row.siteUrl);
    if (project) { row.projectId = project.id; inspections++; }
  }
  for (const run of data.connectorRuns) {
    if (run.projectId || run.source !== "gsc_index" || typeof run.stats?.siteUrl !== "string") continue;
    const project = resolveGscProject(data.projects, run.stats.siteUrl);
    if (project) { run.projectId = project.id; runs++; }
  }
  return { inspections, runs };
}
