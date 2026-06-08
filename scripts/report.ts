import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildGscReportMarkdown } from "@/lib/report";
import { readData } from "@/lib/store";

async function main() {
  const slug = process.argv.slice(2).find((token) => token !== "--");
  if (!slug) {
    throw new Error("Usage: pnpm run report -- <project-slug>");
  }

  const data = await readData();
  const project = data.projects.find((p) => p.slug === slug);
  if (!project) {
    throw new Error(`No project found with slug "${slug}". Configured slugs: ${data.projects.map((p) => p.slug).join(", ")}`);
  }

  const lastGscRun = data.connectorRuns
    .filter((run) => run.projectId === project.id && run.source === "gsc" && run.status === "success")
    .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())[0];

  if (lastGscRun) {
    const ageDays = (Date.now() - new Date(lastGscRun.finishedAt).getTime()) / 86_400_000;
    if (ageDays > 3) {
      console.warn(
        `Warning: last successful GSC sync for "${slug}" was ${ageDays.toFixed(1)} days ago (${lastGscRun.finishedAt}). ` +
          `Run \`pnpm run sync\` first for fresh data.`,
      );
    }
  } else {
    console.warn(`Warning: no successful GSC sync recorded for "${slug}" yet. Run \`pnpm run sync\` first.`);
  }

  const markdown = buildGscReportMarkdown(data, project);

  const reportsDir = path.join(process.cwd(), "project", slug, "reports");
  await mkdir(reportsDir, { recursive: true });
  const fileName = `${new Date().toISOString().slice(0, 10)}-data.md`;
  const filePath = path.join(reportsDir, fileName);
  await writeFile(filePath, markdown, "utf8");

  console.log(`Wrote data report to project/${slug}/reports/${fileName}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
