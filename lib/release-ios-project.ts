import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Project } from "@/lib/types";

export type LocalIosProject = { path: string; framework: "flutter" | "capacitor"; bundleIds: string[] };

async function optionalFile(path: string): Promise<string | undefined> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

async function inspect(path: string): Promise<LocalIosProject[]> {
  const results: LocalIosProject[] = [];
  for (const [framework, file] of [["flutter", "ios/Runner.xcodeproj/project.pbxproj"], ["capacitor", "ios/App/App.xcodeproj/project.pbxproj"]] as const) {
    const source = await optionalFile(join(path, file));
    if (!source) continue;
    const bundleIds = [...new Set([...source.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"?([A-Za-z0-9.-]+)"?\s*;/g)].map((match) => match[1]))];
    results.push({ path, framework, bundleIds });
  }
  return results;
}

/** Bounded discovery: direct app or one level below apps/, never node_modules. */
export async function discoverLocalIosProjects(path: string): Promise<LocalIosProject[]> {
  const root = resolve(path);
  const direct = await inspect(root);
  if (direct.length) return direct;
  let entries;
  try { entries = await readdir(join(root, "apps"), { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const projects = await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => inspect(join(root, "apps", entry.name))));
  return projects.flat();
}

export async function resolveIosProject(projects: Project[], options: { slug?: string; path?: string }): Promise<Project> {
  if (!options.slug && !options.path) throw new Error("iOS requires --slug or --path.");
  const selected = options.slug ? projects.find((project) => project.slug === options.slug) : undefined;
  if (options.slug && !selected) throw new Error(`Unknown project slug: ${options.slug}`);
  if (!options.path) return selected!;
  const local = await discoverLocalIosProjects(options.path);
  if (!local.length) throw new Error("No Flutter/Capacitor iOS project at --path (or apps/*). Native iOS project must be present.");
  const matches = projects.filter((project) => (!selected || selected.id === project.id) && project.iosReleaseConfig && local.some((app) =>
    app.framework === project.iosReleaseConfig!.framework && app.bundleIds.includes(project.iosReleaseConfig!.bundleIds[0])));
  if (matches.length !== 1) throw new Error(matches.length > 1
    ? "Multiple iOS apps found. Pass --slug as well, or --path pointing to the app subfolder."
    : "No configured iOS identity matches this folder. Save its mapping with project:update --ios-config <private.json> first.");
  return matches[0];
}
