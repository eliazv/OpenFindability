import { access } from "node:fs/promises";
import { getDataFilePath, readData } from "@/lib/store";
import type { AppData, SourceType } from "@/lib/types";
import { CONNECTOR_CATALOG } from "@/lib/connectors/catalog";

const STALE_AFTER_DAYS = 3;

export async function getDoctorReport() {
  const data = await readData();
  const dataFile = getDataFilePath();
  const warehouseRun = data.connectorRuns.filter(run => run.source === "motherduck").sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const checks = [
    { name: "MotherDuck warehouse export", status: warehouseRun?.status === "success", required: false,
      detail: warehouseRun ? `${warehouseRun.status} at ${warehouseRun.finishedAt}` : "Not exported yet; sync:warehouse previews, --apply uploads." },
    ...[
      ["MotherDuck", Boolean(process.env.MOTHERDUCK_API_TOKEN), "MOTHERDUCK_API_TOKEN"],
      ["Bing Webmaster", Boolean(process.env.BING_WEBMASTER_API_KEY), "BING_WEBMASTER_API_KEY"],
      ["Cloudflare AI", Boolean(process.env.CLOUDFLARE_API_TOKEN_2 || process.env.CLOUDFLARE_API_TOKEN), "CLOUDFLARE_API_TOKEN_2 or CLOUDFLARE_API_TOKEN"],
      ["Microsoft Clarity", data.projects.some(p => p.clarityTokenEnv && process.env[p.clarityTokenEnv]), "Project clarityTokenEnv mapping and token"],
    ].map(([name, status, detail]) => ({ name: String(name), status: Boolean(status), detail: String(detail), required: false })),
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
      name: "GA4 projects",
      status: data.projects.some((project) => Boolean(project.ga4PropertyId)),
      required: false,
      detail: `${data.projects.filter((project) => project.ga4PropertyId).length} GA4 properties configured (service account needs Analytics Viewer role)`,
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
      name: "RevenueCat credentials",
      status: Boolean(process.env.REVENUECAT_API_KEY),
      required: false,
      detail: "REVENUECAT_API_KEY",
    },
    {
      name: "AdMob credentials",
      status: Boolean(
        process.env.ADMOB_CLIENT_ID &&
          process.env.ADMOB_CLIENT_SECRET &&
          process.env.ADMOB_REFRESH_TOKEN &&
          process.env.ADMOB_PUBLISHER_ID,
      ),
      required: false,
      detail: "ADMOB_CLIENT_ID, ADMOB_CLIENT_SECRET, ADMOB_REFRESH_TOKEN and ADMOB_PUBLISHER_ID",
    },
    {
      name: "AdSense credentials",
      status: Boolean(
        process.env.ADSENSE_CLIENT_ID &&
          process.env.ADSENSE_CLIENT_SECRET &&
          process.env.ADSENSE_REFRESH_TOKEN &&
          process.env.ADSENSE_ACCOUNT_ID,
      ),
      required: false,
      detail: "ADSENSE_CLIENT_ID, ADSENSE_CLIENT_SECRET, ADSENSE_REFRESH_TOKEN and ADSENSE_ACCOUNT_ID",
    },
    {
      name: "App Store Connect credentials",
      ...(await checkAscCredentials()),
      required: false,
    },
    {
      name: "App Store Sales Reports (downloads history)",
      status: Boolean(process.env.ASC_VENDOR_NUMBER),
      required: false,
      detail: process.env.ASC_VENDOR_NUMBER
        ? "ASC_VENDOR_NUMBER set"
        : "ASC_VENDOR_NUMBER not set — downloads history unavailable, retention-only via Analytics Reports",
    },
    {
      name: "Play vitals credentials (crash/ANR)",
      status: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_FILE),
      required: false,
      detail: "reuses GOOGLE_SERVICE_ACCOUNT_JSON/_FILE with the playdeveloperreporting scope",
    },
    {
      name: "Play install/uninstall stats (GCS export)",
      status: Boolean(process.env.GOOGLE_PLAY_STATS_BUCKET),
      required: false,
      detail: process.env.GOOGLE_PLAY_STATS_BUCKET
        ? `bucket: ${process.env.GOOGLE_PLAY_STATS_BUCKET}`
        : "GOOGLE_PLAY_STATS_BUCKET not set — enable Play Console statistics export first",
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
      name: "Incomplete or failed latest syncs",
      status: getLatestSyncProblems(data).length === 0,
      required: false,
      detail: getLatestSyncProblems(data).join("; ") || "no recent partial, no-data or failed runs",
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
    const sources: SourceType[] = [];
    if (project.bingSiteUrl) sources.push("bing_webmaster");
    if (project.cloudflareZoneId) sources.push("cloudflare_ai");
    if (project.clarityTokenEnv) sources.push("clarity");
    if (project.gscProperty) sources.push("gsc");
    if (project.ga4PropertyId) sources.push("ga4");
    if (project.ga4PropertyId && project.websiteUrl) sources.push("ga4_landing");
    if (project.umamiWebsiteId) sources.push("umami");
    if (project.revenueCatProjectId) sources.push("revenuecat");
    if (project.admobAppId || project.admobAppIdIos) sources.push("admob");
    if (project.adsenseSiteDomain) sources.push("adsense");
    if (project.playConsolePackageName) sources.push("play_vitals", "play_stats");
    if (project.appStoreTrackId) sources.push("asc_analytics");

    for (const source of sources) {
      const lastRun = data.connectorRuns
        .filter((run) => run.projectId === project.id && run.source === source && run.status === "success")
        .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())[0];

      if (!lastRun) {
        stale.push({ slug: project.slug, source, ageDays: null });
        continue;
      }

      const ageDays = (Date.now() - new Date(lastRun.finishedAt).getTime()) / 86_400_000;
      if (ageDays > Math.max(staleAfterDays, CONNECTOR_CATALOG[source].staleAfterDays)) {
        stale.push({ slug: project.slug, source, ageDays });
      }
    }
  }

  return stale;
}

export function getLatestSyncProblems(data: Pick<AppData, "projects" | "connectorRuns">): string[] {
  const last = new Map<string, (typeof data.connectorRuns)[number]>();
  for (const run of data.connectorRuns) {
    if (!run.projectId) continue;
    const project = data.projects.find(p => p.id === run.projectId);
    if (!project) continue;
    // Historical failures stay in the audit log, but disconnected sources must
    // not remain current operational warnings after tracking is disabled.
    const configured: Partial<Record<typeof run.source, boolean>> = {
      ga4_landing: Boolean(project.ga4PropertyId && project.websiteUrl),
      pagespeed: Boolean(project.websiteUrl && (project.gscProperty || project.ga4PropertyId || project.umamiWebsiteId)),
      crux: Boolean(process.env.CRUX_API_KEY && project.websiteUrl && (project.gscProperty || project.ga4PropertyId || project.umamiWebsiteId)),
      gsc: Boolean(project.gscProperty), gsc_index: Boolean(project.gscProperty),
      ga4: Boolean(project.ga4PropertyId), umami: Boolean(project.umamiWebsiteId),
      bing_webmaster: Boolean(project.bingSiteUrl), cloudflare_ai: Boolean(project.cloudflareZoneId), clarity: Boolean(project.clarityTokenEnv),
      play_console: Boolean(project.playConsolePackageName), play_vitals: Boolean(project.playConsolePackageName), play_stats: Boolean(project.playConsolePackageName),
      asc_analytics: Boolean(project.appStoreTrackId), asc_metadata: Boolean(project.appStoreTrackId), asc_experiments: Boolean(project.appStoreTrackId),
      admob: Boolean(project.admobAppId || project.admobAppIdIos), revenuecat: Boolean(project.revenueCatProjectId),
      adsense: Boolean(project.adsenseSiteDomain), aso: Boolean(project.asoKeywords?.length),
    };
    if (configured[run.source] === false) continue;
    const key = `${run.projectId}:${run.source}`;
    const previous = last.get(key);
    if (!previous || (run.finishedAt ?? run.startedAt) > (previous.finishedAt ?? previous.startedAt)) {
      last.set(key, run);
    }
  }
  return [...last.values()]
    .filter((run) => ["partial", "no_data", "failed"].includes(run.status))
    .map((run) => {
      const project = data.projects.find((item) => item.id === run.projectId);
      return `${project?.slug ?? run.projectId}/${run.source}: ${run.status} at ${run.finishedAt ?? run.startedAt}`;
    });
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

async function checkAscCredentials(): Promise<{ status: boolean; detail: string }> {
  const issuerId = process.env.ASC_ISSUER_ID;
  const keyId = process.env.ASC_KEY_ID;
  const keyPath = process.env.ASC_PRIVATE_KEY_PATH;
  if (!issuerId || !keyId || !keyPath) {
    return { status: false, detail: "ASC_ISSUER_ID, ASC_KEY_ID and ASC_PRIVATE_KEY_PATH" };
  }
  if (!(await exists(keyPath))) {
    return { status: false, detail: `ASC_PRIVATE_KEY_PATH set but file not found: ${keyPath}` };
  }
  return { status: true, detail: `key file at ${keyPath}` };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
