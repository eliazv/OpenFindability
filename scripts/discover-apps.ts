import "dotenv/config";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { listAscApps, type AscApp } from "@/lib/connectors/appstoreconnect";
import { listPlayVitalsApps, type PlayVitalsApp } from "@/lib/connectors/play-vitals";
import { createId } from "@/lib/id";
import { slugify } from "@/lib/slug";
import { nowIso } from "@/lib/dates";
import { readData, writeData } from "@/lib/store";
import type { Project } from "@/lib/types";

// Account-wide auto-discovery: finds every app visible to the configured credentials on
// each store and either links it to an existing project (matched by playConsolePackageName /
// appStoreTrackId) or creates a new project for it. Existing projects are never overwritten —
// only the store-mapping field that identifies them is set if it was missing.
//
// `updateData`'s mutator is synchronous (it doesn't await a returned promise), so the async
// API calls happen first here and only the in-memory project-list mutation goes through
// readData/writeData directly.
async function main() {
  let playApps: PlayVitalsApp[] = [];
  try {
    playApps = await listPlayVitalsApps();
  } catch (error) {
    console.warn(`Skipping Play Console discovery: ${error instanceof Error ? error.message : error}`);
  }

  let ascApps: AscApp[] = [];
  try {
    ascApps = await listAscApps();
  } catch (error) {
    console.warn(`Skipping App Store Connect discovery: ${error instanceof Error ? error.message : error}`);
  }

  const data = await readData();
  const newProjectSlugs: string[] = [];
  let created = 0;
  let linked = 0;

  for (const app of playApps) {
    if (data.projects.some((p) => p.playConsolePackageName === app.packageName)) continue;

    const name = app.name ?? app.packageName;
    const slug = uniqueSlug(data.projects, name);
    const now = nowIso();
    const project: Project = {
      id: createId("project"),
      name,
      slug,
      type: "app",
      playConsolePackageName: app.packageName,
      createdAt: now,
      updatedAt: now,
    };
    data.projects.push(project);
    newProjectSlugs.push(slug);
    console.log(`Created project "${name}" (slug: ${slug}) for Play Console package ${app.packageName}.`);
    created += 1;
  }

  for (const app of ascApps) {
    const appId = Number(app.id);
    if (data.projects.some((p) => p.appStoreTrackId === appId)) continue;

    const nameGuess = app.name ?? app.bundleId ?? String(app.id);
    // If a Play Console project with the same name-derived slug already exists (common for
    // apps shipping on both stores), link this store id to it instead of creating a duplicate.
    const sameApp = data.projects.find((p) => p.slug === slugify(nameGuess) && !p.appStoreTrackId);
    if (sameApp) {
      sameApp.appStoreTrackId = appId;
      sameApp.updatedAt = nowIso();
      console.log(`Linked App Store id ${appId} to existing project "${sameApp.slug}".`);
      linked += 1;
      continue;
    }

    const slug = uniqueSlug(data.projects, nameGuess);
    const now = nowIso();
    const project: Project = {
      id: createId("project"),
      name: nameGuess,
      slug,
      type: "app",
      appStoreTrackId: appId,
      createdAt: now,
      updatedAt: now,
    };
    data.projects.push(project);
    newProjectSlugs.push(slug);
    console.log(`Created project "${nameGuess}" (slug: ${slug}) for App Store Connect app ${appId}.`);
    created += 1;
  }

  await writeData(data);

  for (const slug of newProjectSlugs) {
    for (const sub of ["reports", "context", "notes"]) {
      await mkdir(path.join(process.cwd(), "project", slug, sub), { recursive: true });
    }
  }

  console.log(`\nDone. Created ${created} new project(s), linked ${linked} existing project(s).`);
}

function uniqueSlug(projects: Project[], name: string): string {
  const base = slugify(name) || "app";
  let slug = base;
  let suffix = 2;
  const existingSlugs = new Set(projects.map((p) => p.slug));
  while (existingSlugs.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
