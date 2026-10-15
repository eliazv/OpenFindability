import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readData } from "@/lib/store";
import { seoGeoMarkdown } from "@/lib/analytics/seo-geo";

async function main() {
  const slug = process.argv.slice(2).filter(a => a !== "--")[0];
  const data = await readData();
  const project = data.projects.find(p => p.slug === slug);
  if (!project || !/^[a-z0-9_-]+$/.test(project.slug)) throw new Error("Usage: report:seo-geo <existing-project-slug>");
  const directory = path.join(process.cwd(), "project", project.slug, "reports");
  await mkdir(directory, { recursive: true });
  const destination = path.join(directory, `${new Date().toISOString().slice(0,10)}-seo-geo.md`);
  await writeFile(destination, seoGeoMarkdown(project, data.seoGeoObservations ?? []));
  console.log(destination);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
