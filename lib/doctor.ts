import { access } from "node:fs/promises";
import { getDataFilePath, readData } from "@/lib/store";
import type { AppData } from "@/lib/types";

const STALE_AFTER_DAYS = 3;

export async function getDoctorReport() {
  const data = await readData();
  const dataFile = getDataFilePath();
  const checks = [
    {
      name: "Data file",
      status: await exists(dataFile),
      required: true,
      detail: dataFile,
    },
    {
      name: "Projects",
      status: data.projects.length > 0,
      required: true,
      detail: `${data.projects.length} configured`,
    },
    {
      name: "GSC credentials",
      status: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_FILE),
      required: false,
      detail: "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE",
    },
    {
      name: "Umami credentials",
      status: Boolean(process.env.UMAMI_API_KEY),
      required: false,
      detail: "UMAMI_API_KEY",
    },
    {
      name: "Play Console projects",
      status: data.projects.some((p) => Boolean(p.playConsolePackageName)),
      required: false,
      detail: `${data.projects.filter((p) => p.playConsolePackageName).length} configured`,
    },
    {
      name: "Connector runs",
      status: data.connectorRuns.length > 0,
      required: false,
      detail: `${data.connectorRuns.length} recorded`,
    },
    {
      name: "Data freshness",
      status: getStaleProjects(data, STALE_AFTER_DAYS).length === 0,
      required: false,
      detail: describeFreshness(data, STALE_AFTER_DAYS),
    },
    {
      name: "ASO projects",
      status: data.projects.some((p) => Boolean(p.asoKeywords?.length)),
      required: false,
      detail: `${data.projects.filter((p) => p.asoKeywords?.length).length} configured with asoKeywords`,
    },
    {
      name: "ASO cache",
      status: (data.asoKeywordSnapshots?.length ?? 0) > 0,
      required: false,
      detail: `${data.asoKeywordSnapshots?.length ?? 0} keyword snapshots; ${
        data.asoAppRankSnapshots?.length ?? 0
      } app-rank snapshots`,
    },
    {
      name: "RespectASO instance",
      ...(await checkRespectAso(data)),
      required: false,
    },
  ];

  return {
    ok: checks.every((check) => check.status || !check.required),
    checks,
  };
}

function getStaleProjects(data: AppData, staleAfterDays: number): { slug: string; source: string; ageDays: number | null }[] {
  const stale: { slug: string; source: string; ageDays: number | null }[] = [];

  for (const project of data.projects) {
    const sources: ("gsc" | "umami")[] = [];
    if (project.gscProperty) sources.push("gsc");
    if (project.umamiWebsiteId) sources.push("umami");

    for (const source of sources) {
      const lastRun = data.connectorRuns
        .filter((run) => run.projectId === project.id && run.source === source && run.status === "success")
        .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())[0];

      if (!lastRun) {
        stale.push({ slug: project.slug, source, ageDays: null });
        continue;
      }

      const ageDays = (Date.now() - new Date(lastRun.finishedAt).getTime()) / 86_400_000;
      if (ageDays > staleAfterDays) {
        stale.push({ slug: project.slug, source, ageDays });
      }
    }
  }

  return stale;
}

function describeFreshness(data: AppData, staleAfterDays: number): string {
  const stale = getStaleProjects(data, staleAfterDays);
  if (stale.length === 0) {
    return `all configured sources synced within ${staleAfterDays} days`;
  }

  return stale
    .map(({ slug, source, ageDays }) =>
      ageDays === null ? `${slug}/${source}: never synced` : `${slug}/${source}: ${ageDays.toFixed(1)}d old`,
    )
    .join("; ");
}

async function checkRespectAso(data: AppData): Promise<{ status: boolean; detail: string }> {
  const hasAsoProjects = data.projects.some((p) => Boolean(p.asoKeywords?.length));
  if (!hasAsoProjects) {
    return { status: true, detail: "skipped — no project has asoKeywords configured" };
  }

  const baseUrl = process.env.RESPECT_ASO_BASE_URL ?? "http://localhost";
  try {
    const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      return { status: false, detail: `${baseUrl} responded with ${response.status} — check \`docker compose up -d\`` };
    }
    return { status: true, detail: `reachable at ${baseUrl}` };
  } catch {
    return { status: false, detail: `not reachable at ${baseUrl} — start it with \`docker compose up -d\`` };
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
