import "dotenv/config";
import { bingRead } from "@/lib/connectors/bing";
import { cloudflareToken, cloudflareZones } from "@/lib/connectors/cloudflare-ai";
import { clarityRead } from "@/lib/connectors/clarity";
import { hostOf } from "@/lib/connectors/seo-geo-common";
import { readData, updateData } from "@/lib/store";
import type { Project } from "@/lib/types";

async function main() {
  const apply = process.argv.includes("--apply");
  const projects = (await readData()).projects;
  const patches = new Map<string, Partial<Project>>();
  let failed = false;
  const patch = (p: Project, fields: Partial<Project>) => patches.set(p.id, { ...patches.get(p.id), ...fields });
  if (process.env.BING_WEBMASTER_API_KEY) {
    try {
      const sites = await bingRead("GetUserSites");
      console.log(`Bing: ${sites.filter(s => s.IsVerified).length} verified sites.`);
      for (const p of projects) {
        const matches = sites.filter(s => s.IsVerified && hostOf(String(s.Url))?.replace(/^www\./, "") === hostOf(p.websiteUrl)?.replace(/^www\./, ""));
        if (matches.length === 1 && !p.bingSiteUrl) patch(p, { bingSiteUrl: String(matches[0].Url) });
      }
      for (const site of sites) if (!projects.some(p => hostOf(p.websiteUrl)?.replace(/^www\./, "") === hostOf(String(site.Url))?.replace(/^www\./, ""))) console.log(`Unmapped Bing property: ${site.Url}`);
    } catch (error) { console.log(`Bing: ${(error as Error).message}`); failed = true; }
  }
  if (cloudflareToken()) {
    try {
      const zones = await cloudflareZones();
      console.log(`Cloudflare: ${zones.length} accessible zones (proxy/analytics verified during sync).`);
      for (const p of projects) {
        const host = hostOf(p.websiteUrl);
        const matches = zones.filter(z => z.status === "active" && (host === z.name || host?.endsWith(`.${z.name}`))).sort((a,b) => b.name.length - a.name.length);
        if (matches.length && !p.cloudflareZoneId) patch(p, { cloudflareZoneId: matches[0].id });
      }
    } catch (error) { console.log(`Cloudflare: ${(error as Error).message}`); failed = true; }
  }
  if (process.env.MICROSOFT_CLARITY_TOKEN) {
    try {
      const metrics = await clarityRead();
      const hosts = new Set(metrics.flatMap(m => m.information.map(r => hostOf(String(r.Url ?? r.URL ?? ""))?.replace(/^www\./, ""))).filter(Boolean));
      const matches = projects.filter(p => hosts.has(hostOf(p.websiteUrl)?.replace(/^www\./, "")));
      console.log(`Clarity: ${metrics.length} metric groups; ${matches.length} local website matches.`);
      // No project-list API: only bind a global project token when a unique website matches.
      if (matches.length === 1 && !matches[0].clarityTokenEnv) patch(matches[0], { clarityTokenEnv: "MICROSOFT_CLARITY_TOKEN" });
    } catch (error) { console.log(`Clarity: ${(error as Error).message}`); failed = true; }
  }
  for (const p of projects) if (patches.has(p.id)) console.log(`${apply ? "APPLY" : "DRY RUN"} ${p.slug}: ${JSON.stringify(patches.get(p.id))}`);
  if (apply && patches.size) await updateData(data => { for (const p of data.projects) if (patches.has(p.id)) Object.assign(p, patches.get(p.id), { updatedAt: new Date().toISOString() }); });
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
