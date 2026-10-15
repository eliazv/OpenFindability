import type { Project, SeoGeoObservation } from "@/lib/types";

export function seoGeoSnapshot(project: Project, rows: SeoGeoObservation[], limit = 100) {
  const scoped = rows.filter(r => r.projectId === project.id);
  return {
    slug: project.slug,
    definitions: {
      bing_webmaster: "Daily site totals and provider-period top query/page rows are separate datasets.",
      cloudflare_ai: "User-agent crawler requests through Cloudflare proxy; sampled, not AI citations.",
      clarity: "Rolling last-24h per-URL snapshots. Windows overlap; never sum across exports.",
    },
    sources: (["bing_webmaster", "cloudflare_ai", "clarity"] as const).map(source => {
      const found = scoped.filter(r => r.source === source).sort((a,b) => b.fetchedAt.localeCompare(a.fetchedAt));
      const latest = found[0]?.fetchedAt ?? null;
      return { source, configured: source === "bing_webmaster" ? Boolean(project.bingSiteUrl) : source === "cloudflare_ai" ? Boolean(project.cloudflareZoneId) : Boolean(project.clarityTokenEnv),
        storedRows: found.length, fetchedAt: latest, coverage: found[0]?.coverage ?? null,
        rows: found.filter(r => r.fetchedAt === latest).slice(0, limit).map(({ rawJson: _, ...rest }) => rest),
        returnedLimit: limit,
      };
    }),
  };
}

export function seoGeoMarkdown(project: Project, rows: SeoGeoObservation[]) {
  const snapshot = seoGeoSnapshot(project, rows, 20);
  const lines = [`# ${project.name} — SEO/GEO — ${new Date().toISOString().slice(0,10)}`, "", ...Object.entries(snapshot.definitions).map(([source, text]) => `- ${source}: ${text}`), ""];
  for (const source of snapshot.sources) {
    lines.push(`## ${source.source}`, "", `Configured: ${source.configured}. Stored observations: ${source.storedRows}. Latest import: ${source.fetchedAt ?? "unavailable"}.`, "", `Coverage: ${JSON.stringify(source.coverage)}`, "", "Latest import sample (maximum 20 rows):", "");
    for (const row of source.rows) lines.push(`- ${row.kind}: ${row.scope} — ${row.windowStart} to ${row.windowEnd} — ${JSON.stringify(row.metrics)}`);
    lines.push("");
  }
  return lines.join("\n");
}
