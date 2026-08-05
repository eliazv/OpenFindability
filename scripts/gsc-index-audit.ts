import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { auditGscIndex } from "@/lib/gsc-index-audit";
import { buildGscIndexAuditReportMarkdown } from "@/lib/report";
import { readData } from "@/lib/store";

async function main() {
  const args = process.argv.slice(2).filter((token) => token !== "--");
  const limit = args[0] ? Number(args[0]) : undefined;
  const siteFilter = args[1];

  const results = await auditGscIndex({
    maxUrlsPerSite: limit,
    siteFilter,
    onProgress: console.log,
  });

  console.log("");
  console.log("Google Search Console index audit summary");
  for (const result of results) {
    console.log(
      `${result.siteUrl}: ${result.inspected} inspected, ${result.indexed} indexed, ` +
        `${result.problems} problems, ${result.failed} failures, ${result.discovered} discovered`,
    );
    for (const warning of result.discoveryWarnings) console.warn(`  Warning: ${warning}`);
  }

  const data = await readData();
  const today = new Date().toISOString().slice(0, 10);
  const globalReportsDir = path.join(process.cwd(), "private-notes", "index-audits");
  await mkdir(globalReportsDir, { recursive: true });
  const globalReportPath = path.join(globalReportsDir, `${today}-gsc-index-audit.md`);
  await writeFile(globalReportPath, buildGscIndexAuditReportMarkdown(data), "utf8");
  console.log(`Wrote global report to private-notes/index-audits/${today}-gsc-index-audit.md`);

  for (const project of data.projects.filter((item) => item.gscProperty)) {
    const hasInspections = data.gscIndexInspections.some((row) => row.projectId === project.id);
    if (!hasInspections) continue;
    const reportsDir = path.join(process.cwd(), "project", project.slug, "reports");
    await mkdir(reportsDir, { recursive: true });
    const reportPath = path.join(reportsDir, `${today}-gsc-index-audit.md`);
    await writeFile(reportPath, buildGscIndexAuditReportMarkdown(data, { project }), "utf8");
    console.log(`Wrote project report to project/${project.slug}/reports/${today}-gsc-index-audit.md`);
  }

  const unmappedSites = [
    ...new Set(
      data.gscIndexInspections
        .filter((row) => !row.projectId)
        .map((row) => row.siteUrl),
    ),
  ];
  for (const siteUrl of unmappedSites) {
    const slug = siteUrl
      .replace(/^sc-domain:/, "")
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    const reportsDir = path.join(process.cwd(), "project", slug, "reports");
    await mkdir(reportsDir, { recursive: true });
    const reportPath = path.join(reportsDir, `${today}-gsc-index-audit.md`);
    await writeFile(reportPath, buildGscIndexAuditReportMarkdown(data, { siteUrl }), "utf8");
    console.log(`Wrote unmapped property report to project/${slug}/reports/${today}-gsc-index-audit.md`);
  }

  process.exit(results.some((result) => result.failed > 0 && result.inspected === 0) ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
