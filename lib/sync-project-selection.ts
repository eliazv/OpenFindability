import type { Project } from "./types";

/** Reject a mistyped scope before contacting any provider or writing the store. */
export function selectSyncProjects(projects: Project[], slug?: string): Project[] {
  if (slug === undefined) return projects;
  const matches = projects.filter(project => project.slug === slug);
  if (matches.length !== 1) throw new Error("Sync project slug must identify exactly one configured project.");
  return matches;
}
