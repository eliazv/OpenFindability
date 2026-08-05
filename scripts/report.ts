import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildAscReportMarkdown,
  buildAsoReportMarkdown,
  buildGscIndexAuditReportMarkdown,
  buildGscReportMarkdown,
  buildMonetizationReportMarkdown,
} from "@/lib/report";
import { readData } from "@/lib/store";
import type { AppData, Project, SourceType } from "@/lib/types";

function warnIfStale(data: AppData, project: Project, source: SourceType, label: string) {
  const lastRun = data.connectorRuns
    .filter((run) => run.projectId === project.id && run.source === source && run.status === "success")
    .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())[0];

  if (!lastRun) {
    console.warn(`Warning: no successful ${label} sync recorded for "${project.slug}" yet.`);
    return;
  }

  const ageDays = (Date.now() - new Date(lastRun.finishedAt).getTime()) / 86_400_000;
  if (ageDays > 3) {
    console.warn(
      `Warning: last successful ${label} sync for "${project.slug}" was ${ageDays.toFixed(1)} days ago (${lastRun.finishedAt}).`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2).filter((token) => token !== "--");
  const slug = args[0];
  if (!slug) {
    throw new Error("Usage: pnpm run report -- <project-slug> [gsc|index|aso|asc|monetization|all]");
  }
  const section = args[1] ?? "all";

  const data = await readData();
  const project = data.projects.find((p) => p.slug === slug);
  if (!project) {
    throw new Error(`No project found with slug "${slug}". Configured slugs: ${data.projects.map((p) => p.slug).join(", ")}`);
  }

  const reportsDir = path.join(process.cwd(), "project", slug, "reports");
  await mkdir(reportsDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);

  if (section === "gsc" || section === "all") {
    warnIfStale(data, project, "gsc", "GSC");
    const markdown = buildGscReportMarkdown(data, project);
    const fileName = `${today}-gsc-data.md`;
    await writeFile(path.join(reportsDir, fileName), markdown, "utf8");
    console.log(`Wrote GSC data report to project/${slug}/reports/${fileName}`);
  }

  if (section === "aso" || section === "all") {
    if (!project.asoKeywords || project.asoKeywords.length === 0) {
      console.log(`Skipping ASO report for "${slug}": no asoKeywords configured on the project.`);
    } else {
      warnIfStale(data, project, "aso", "ASO");
      const markdown = buildAsoReportMarkdown(data, project);
      const fileName = `${today}-aso-data.md`;
      await writeFile(path.join(reportsDir, fileName), markdown, "utf8");
      console.log(`Wrote ASO data report to project/${slug}/reports/${fileName}`);
    }
  }

  if (section === "index" || section === "all") {
    if (!project.gscProperty) {
      console.log(`Skipping index audit report for "${slug}": no gscProperty configured on the project.`);
    } else {
      const markdown = buildGscIndexAuditReportMarkdown(data, { project });
      const fileName = `${today}-gsc-index-audit.md`;
      await writeFile(path.join(reportsDir, fileName), markdown, "utf8");
      console.log(`Wrote GSC index audit report to project/${slug}/reports/${fileName}`);
    }
  }

  if (section === "asc" || section === "all") {
    if (data.ascMetadataSnapshots.every((row) => row.projectId !== project.id) && data.ascExperiments.every((row) => row.projectId !== project.id)) {
      console.log(`Skipping App Store Connect report for "${slug}": no data pulled yet (run aso:pull-copy / asc:experiments).`);
    } else {
      const markdown = buildAscReportMarkdown(data, project);
      const fileName = `${today}-appstoreconnect-data.md`;
      await writeFile(path.join(reportsDir, fileName), markdown, "utf8");
      console.log(`Wrote App Store Connect report to project/${slug}/reports/${fileName}`);
    }
  }

  if (section === "monetization" || section === "all") {
    if (!project.admobAppId && !project.revenueCatProjectId) {
      console.log(`Skipping monetization report for "${slug}": no admobAppId/revenueCatProjectId configured on the project.`);
    } else {
      if (project.admobAppId) warnIfStale(data, project, "admob", "AdMob");
      if (project.revenueCatProjectId) warnIfStale(data, project, "revenuecat", "RevenueCat");
      const markdown = buildMonetizationReportMarkdown(data, project);
      const fileName = `${today}-monetization-data.md`;
      await writeFile(path.join(reportsDir, fileName), markdown, "utf8");
      console.log(`Wrote monetization data report to project/${slug}/reports/${fileName}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
