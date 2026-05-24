import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import dotenv from "dotenv";
import { google } from "googleapis";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { syncGscProject } from "@/lib/connectors/gsc";
import { syncUmamiProject } from "@/lib/connectors/umami";
import { buildOpportunities } from "@/lib/insights";
import { createId } from "@/lib/id";
import type { AppData, Project, ProjectType } from "@/lib/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Load .env from OpenFindability root regardless of cwd
dotenv.config({ path: join(projectRoot, ".env") });

// Resolve relative service account path to absolute
const saFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
if (saFile && !isAbsolute(saFile)) {
  process.env.GOOGLE_SERVICE_ACCOUNT_FILE = join(projectRoot, saFile);
}

async function readProjects(): Promise<Project[]> {
  const dataPath = join(projectRoot, "data", "openfindability.json");
  try {
    const raw = await readFile(dataPath, "utf8");
    const data = JSON.parse(raw) as Partial<AppData>;
    return data.projects ?? [];
  } catch {
    return [];
  }
}

async function readStoredData(): Promise<AppData> {
  const dataPath = join(projectRoot, "data", "openfindability.json");
  const empty: AppData = {
    projects: [],
    metricSnapshots: [],
    searchQueries: [],
    pageMetrics: [],
    opportunities: [],
    connectorRuns: [],
  };
  try {
    const raw = await readFile(dataPath, "utf8");
    return { ...empty, ...(JSON.parse(raw) as Partial<AppData>) };
  } catch {
    return empty;
  }
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function findProject(projects: Project[], slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug || p.id === slug);
}

function stripRaw<T extends { rawJson?: unknown }>(items: T[]): Omit<T, "rawJson">[] {
  return items.map(({ rawJson: _, ...rest }) => rest);
}

async function writeStoredData(data: AppData): Promise<void> {
  const dataPath = join(projectRoot, "data", "openfindability.json");
  await mkdir(dirname(dataPath), { recursive: true });
  await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function getGoogleAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!json && !file) return null;
  const credentials = JSON.parse(json || (await readFile(file as string, "utf8")));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

const server = new McpServer({
  name: "openfindability",
  version: "0.1.0",
});

server.tool(
  "list_projects",
  "OpenFindability is a local SEO/analytics hub that connects Google Search Console and Umami to track web projects. This tool lists all configured projects. Returns: array of { slug, name, url, gsc (bool), umami (bool) }. Use slug values in all other tools.",
  {},
  async () => {
    const projects = await readProjects();
    const list = projects.map((p) => ({
      slug: p.slug,
      name: p.name,
      url: p.websiteUrl,
      gsc: !!p.gscProperty,
      umami: !!p.umamiWebsiteId,
    }));
    return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
  },
);

server.tool(
  "get_gsc_stats",
  "Fetch LIVE Google Search Console data for a project (calls GSC API in real time, no cache). Returns: { summary: { totalClicks, totalImpressions, avgCtrPercent, avgPosition }, topQueries: [{ query, page, clicks, impressions, ctr, avgPosition }], topPages: [{ page, clicks, impressions, ctr, avgPosition }], dailySnapshots: [{ date, clicks, impressions, ctr, avgPosition }] }. Use 'days' to control range (default 30, max 90).",
  {
    slug: z.string().describe("Project slug (use list_projects to see options)"),
    days: z.number().int().min(1).max(90).default(30).describe("Number of days to look back (default 30)"),
    limit: z.number().int().min(1).max(100).default(20).describe("Max rows for queries/pages (default 20)"),
  },
  async ({ slug, days, limit }) => {
    const projects = await readProjects();
    const project = findProject(projects, slug);
    if (!project) {
      return { content: [{ type: "text", text: `Project "${slug}" not found. Use list_projects to see options.` }] };
    }
    if (!project.gscProperty) {
      return { content: [{ type: "text", text: `Project "${slug}" has no GSC property configured.` }] };
    }

    const endDate = yesterday();
    const startDate = daysAgo(days);

    const { result, snapshots, queries, pages } = await syncGscProject(project, startDate, endDate);

    if (result.status === "skipped" || result.status === "failed") {
      return { content: [{ type: "text", text: `GSC sync failed: ${result.message}` }] };
    }

    const totalClicks = snapshots.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const totalImpressions = snapshots.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const avgPosition =
      snapshots.length > 0
        ? snapshots.reduce((s, r) => s + (r.avgPosition ?? 0), 0) / snapshots.length
        : 0;

    const output = {
      project: project.name,
      period: { startDate, endDate, days },
      summary: {
        totalClicks,
        totalImpressions,
        avgCtr: parseFloat((avgCtr * 100).toFixed(2)),
        avgPosition: parseFloat(avgPosition.toFixed(1)),
      },
      topQueries: stripRaw(
        [...queries].sort((a, b) => b.clicks - a.clicks).slice(0, limit),
      ),
      topPages: stripRaw(
        [...pages].sort((a, b) => b.clicks - a.clicks).slice(0, limit),
      ),
      dailySnapshots: stripRaw(
        [...snapshots].sort((a, b) => a.date.localeCompare(b.date)),
      ),
    };

    return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
  },
);

server.tool(
  "get_umami_stats",
  "Fetch LIVE Umami analytics for a project for a specific date (calls Umami API in real time). Returns: { project, date, visitors, pageviews }. Default date is yesterday (GSC/Umami data has ~1 day delay). Pass date as YYYY-MM-DD.",
  {
    slug: z.string().describe("Project slug (use list_projects to see options)"),
    date: z.string().optional().describe("Date in YYYY-MM-DD format (default: yesterday)"),
  },
  async ({ slug, date }) => {
    const projects = await readProjects();
    const project = findProject(projects, slug);
    if (!project) {
      return { content: [{ type: "text", text: `Project "${slug}" not found. Use list_projects to see options.` }] };
    }
    if (!project.umamiWebsiteId) {
      return { content: [{ type: "text", text: `Project "${slug}" has no Umami website ID configured.` }] };
    }

    const targetDate = date ?? yesterday();
    const { result, snapshots } = await syncUmamiProject(project, targetDate);

    if (result.status === "skipped" || result.status === "failed") {
      return { content: [{ type: "text", text: `Umami sync failed: ${result.message}` }] };
    }

    const snap = snapshots[0];
    const output = {
      project: project.name,
      date: targetDate,
      visitors: snap?.visitors ?? 0,
      pageviews: snap?.pageviews ?? 0,
    };

    return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
  },
);

server.tool(
  "get_opportunities",
  "Get SEO opportunities for a project from the local JSON store (NOT live — computed during last 'pnpm sync'). Returns: { count, opportunities: [{ type, title, severity (low|medium|high), score, description }] }. Types include: low_ctr_query, striking_distance_query, page_two_query, zero_click_query, declining_page, query_cannibalization. Filter by severity if needed.",
  {
    slug: z.string().describe("Project slug (use list_projects to see options)"),
    severity: z
      .enum(["low", "medium", "high", "all"])
      .default("all")
      .describe("Filter by severity (default: all)"),
  },
  async ({ slug, severity }) => {
    const data = await readStoredData();
    const project = findProject(data.projects, slug);
    if (!project) {
      return { content: [{ type: "text", text: `Project "${slug}" not found. Use list_projects to see options.` }] };
    }

    let opps = data.opportunities.filter(
      (o) => o.projectId === project.id && o.status === "open",
    );
    if (severity !== "all") {
      opps = opps.filter((o) => o.severity === severity);
    }

    const output = {
      project: project.name,
      count: opps.length,
      opportunities: stripRaw(opps).map((o) => ({
        type: o.type,
        title: o.title,
        severity: o.severity,
        score: o.score,
        description: o.description,
      })),
    };

    return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
  },
);

server.tool(
  "list_gsc_properties",
  "List all GSC properties the configured service account can access (calls GSC API live). Returns: [{ url, permissionLevel }]. The 'url' value is what goes in gscProperty when calling create_project or update_project. Call this first if you don't know the exact property URL.",
  {},
  async () => {
    const auth = await getGoogleAuth();
    if (!auth) {
      return { content: [{ type: "text", text: "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE is not configured." }] };
    }
    const searchconsole = google.searchconsole({ version: "v1", auth });
    const response = await searchconsole.sites.list();
    const sites = (response.data.siteEntry ?? []).map((s) => ({
      url: s.siteUrl,
      permissionLevel: s.permissionLevel,
    }));
    return { content: [{ type: "text", text: JSON.stringify(sites, null, 2) }] };
  },
);

server.tool(
  "create_project",
  "Add a new project to OpenFindability's local store. After creation, data will be fetched live by get_gsc_stats / get_umami_stats. Call list_gsc_properties first to get the exact gscProperty URL. Returns the created project object. gscProperty format: 'sc-domain:example.com' for domain properties or 'https://example.com/' for URL-prefix properties.",
  {
    name: z.string().describe("Display name of the project"),
    slug: z.string().describe("URL-safe slug, e.g. my-project"),
    type: z.enum(["web", "app", "web_app"]).default("web").describe("Project type"),
    websiteUrl: z.string().optional().describe("Website URL, e.g. https://example.com"),
    gscProperty: z.string().optional().describe("GSC property URL (e.g. sc-domain:example.com or https://example.com/)"),
    umamiWebsiteId: z.string().optional().describe("Umami website UUID"),
    category: z.string().optional().describe("Optional category label"),
    notes: z.string().optional().describe("Optional notes"),
  },
  async ({ name, slug, type, websiteUrl, gscProperty, umamiWebsiteId, category, notes }) => {
    const data = await readStoredData();

    if (data.projects.some((p) => p.slug === slug)) {
      return { content: [{ type: "text", text: `A project with slug "${slug}" already exists.` }] };
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: createId("project"),
      name,
      slug,
      type: type as ProjectType,
      websiteUrl,
      gscProperty,
      umamiWebsiteId,
      category,
      notes,
      createdAt: now,
      updatedAt: now,
    };

    data.projects.push(project);
    await writeStoredData(data);

    return {
      content: [{
        type: "text",
        text: `Project "${name}" created with slug "${slug}".\n${JSON.stringify(project, null, 2)}`,
      }],
    };
  },
);

server.tool(
  "update_project",
  "Update one or more fields of an existing project in the local store. Only pass fields you want to change. Set a field to empty string '' to clear it (e.g. remove a GSC property). Returns the updated project object.",
  {
    slug: z.string().describe("Project slug to update"),
    name: z.string().optional(),
    type: z.enum(["web", "app", "web_app"]).optional(),
    websiteUrl: z.string().optional(),
    gscProperty: z.string().optional().describe("Set to empty string to remove"),
    umamiWebsiteId: z.string().optional().describe("Set to empty string to remove"),
    category: z.string().optional(),
    notes: z.string().optional(),
  },
  async ({ slug, ...fields }) => {
    const data = await readStoredData();
    const idx = data.projects.findIndex((p) => p.slug === slug);
    if (idx === -1) {
      return { content: [{ type: "text", text: `Project "${slug}" not found.` }] };
    }

    const project = data.projects[idx];
    const updated: Project = {
      ...project,
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.type !== undefined && { type: fields.type as ProjectType }),
      ...(fields.websiteUrl !== undefined && { websiteUrl: fields.websiteUrl || undefined }),
      ...(fields.gscProperty !== undefined && { gscProperty: fields.gscProperty || undefined }),
      ...(fields.umamiWebsiteId !== undefined && { umamiWebsiteId: fields.umamiWebsiteId || undefined }),
      ...(fields.category !== undefined && { category: fields.category || undefined }),
      ...(fields.notes !== undefined && { notes: fields.notes || undefined }),
      updatedAt: new Date().toISOString(),
    };

    data.projects[idx] = updated;
    await writeStoredData(data);

    return { content: [{ type: "text", text: `Project "${slug}" updated.\n${JSON.stringify(updated, null, 2)}` }] };
  },
);

server.tool(
  "delete_project",
  "Permanently remove a project and ALL its stored data (snapshots, queries, pages, opportunities) from the local JSON store. Irreversible — no backup. Requires confirm: true. Returns a count of deleted records per type.",
  {
    slug: z.string().describe("Project slug to delete"),
    confirm: z.boolean().describe("Must be true to confirm deletion"),
  },
  async ({ slug, confirm }) => {
    if (!confirm) {
      return { content: [{ type: "text", text: 'Pass confirm: true to delete the project.' }] };
    }

    const data = await readStoredData();
    const project = findProject(data.projects, slug);
    if (!project) {
      return { content: [{ type: "text", text: `Project "${slug}" not found.` }] };
    }

    const id = project.id;
    const counts = {
      snapshots: data.metricSnapshots.filter((x) => x.projectId === id).length,
      queries: data.searchQueries.filter((x) => x.projectId === id).length,
      pages: data.pageMetrics.filter((x) => x.projectId === id).length,
      opportunities: data.opportunities.filter((x) => x.projectId === id).length,
    };

    data.projects = data.projects.filter((p) => p.id !== id);
    data.metricSnapshots = data.metricSnapshots.filter((x) => x.projectId !== id);
    data.searchQueries = data.searchQueries.filter((x) => x.projectId !== id);
    data.pageMetrics = data.pageMetrics.filter((x) => x.projectId !== id);
    data.opportunities = data.opportunities.filter((x) => x.projectId !== id);

    await writeStoredData(data);

    return {
      content: [{
        type: "text",
        text: `Project "${project.name}" deleted along with: ${JSON.stringify(counts)}.`,
      }],
    };
  },
);

server.tool(
  "get_project_summary",
  "All-in-one project overview: fetches LIVE GSC data + LIVE Umami yesterday stats + stored opportunities in a single call. Best tool to call first when starting work on a project. Returns: { gsc: { period, totalClicks, totalImpressions, avgCtrPercent, avgPosition, topQueries[10], topPages[10] }, umami: { date, visitors, pageviews }, opportunities: { total, high, medium, top5 } }. Null for gsc/umami if connector not configured.",
  {
    slug: z.string().describe("Project slug (use list_projects to see options)"),
    days: z.number().int().min(1).max(90).default(30).describe("GSC date range in days (default 30)"),
  },
  async ({ slug, days }) => {
    const data = await readStoredData();
    const project = findProject(data.projects, slug);
    if (!project) {
      return { content: [{ type: "text", text: `Project "${slug}" not found. Use list_projects to see options.` }] };
    }

    const endDate = yesterday();
    const startDate = daysAgo(days);
    const summary: Record<string, unknown> = { project: project.name, slug: project.slug, url: project.websiteUrl };

    if (project.gscProperty) {
      const { result, snapshots, queries, pages } = await syncGscProject(project, startDate, endDate);
      if (result.status === "success") {
        const totalClicks = snapshots.reduce((s, r) => s + (r.clicks ?? 0), 0);
        const totalImpressions = snapshots.reduce((s, r) => s + (r.impressions ?? 0), 0);
        const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
        const avgPosition = snapshots.length > 0
          ? snapshots.reduce((s, r) => s + (r.avgPosition ?? 0), 0) / snapshots.length
          : 0;

        summary.gsc = {
          period: { startDate, endDate },
          totalClicks,
          totalImpressions,
          avgCtrPercent: parseFloat((avgCtr * 100).toFixed(2)),
          avgPosition: parseFloat(avgPosition.toFixed(1)),
          topQueries: stripRaw([...queries].sort((a, b) => b.clicks - a.clicks).slice(0, 10)),
          topPages: stripRaw([...pages].sort((a, b) => b.clicks - a.clicks).slice(0, 10)),
        };
      } else {
        summary.gsc = { error: result.message };
      }
    } else {
      summary.gsc = null;
    }

    if (project.umamiWebsiteId) {
      const { result, snapshots } = await syncUmamiProject(project, yesterday());
      if (result.status === "success" && snapshots[0]) {
        summary.umami = { date: yesterday(), visitors: snapshots[0].visitors, pageviews: snapshots[0].pageviews };
      } else {
        summary.umami = { error: result.message };
      }
    } else {
      summary.umami = null;
    }

    const opps = data.opportunities.filter((o) => o.projectId === project.id && o.status === "open");
    summary.opportunities = {
      total: opps.length,
      high: opps.filter((o) => o.severity === "high").length,
      medium: opps.filter((o) => o.severity === "medium").length,
      top5: opps.slice(0, 5).map((o) => ({ type: o.type, title: o.title, severity: o.severity })),
    };

    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  },
);

server.tool(
  "get_page_keywords",
  "Fetch LIVE GSC queries ranking for a specific page URL (calls GSC API). Useful when optimizing a page — pass the URL or a partial path to filter. Returns: { queryCount, totalClicks, totalImpressions, queries: [{ query, page, clicks, impressions, ctr, avgPosition }] } sorted by impressions desc. Use minImpressions to filter noise.",
  {
    slug: z.string().describe("Project slug"),
    pageUrl: z.string().describe("Full page URL or path to filter, e.g. https://example.com/blog/post or /blog/post"),
    days: z.number().int().min(1).max(90).default(30).describe("Days to look back (default 30)"),
    minImpressions: z.number().int().min(0).default(1).describe("Minimum impressions to include (default 1)"),
  },
  async ({ slug, pageUrl, days, minImpressions }) => {
    const projects = await readProjects();
    const project = findProject(projects, slug);
    if (!project) {
      return { content: [{ type: "text", text: `Project "${slug}" not found.` }] };
    }
    if (!project.gscProperty) {
      return { content: [{ type: "text", text: `Project "${slug}" has no GSC property configured.` }] };
    }

    const endDate = yesterday();
    const startDate = daysAgo(days);
    const { result, queries } = await syncGscProject(project, startDate, endDate);

    if (result.status !== "success") {
      return { content: [{ type: "text", text: `GSC failed: ${result.message}` }] };
    }

    const filtered = queries
      .filter((q) => q.page && q.page.includes(pageUrl) && q.impressions >= minImpressions)
      .sort((a, b) => b.impressions - a.impressions);

    const output = {
      project: project.name,
      page: pageUrl,
      period: { startDate, endDate },
      queryCount: filtered.length,
      totalClicks: filtered.reduce((s, q) => s + q.clicks, 0),
      totalImpressions: filtered.reduce((s, q) => s + q.impressions, 0),
      queries: stripRaw(filtered),
    };

    return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
  },
);

server.tool(
  "compare_periods",
  "Compare GSC performance between current period and the equivalent previous period (makes 2 parallel live GSC API calls). E.g. days=30 compares last 30 days vs the 30 days before that. Returns: { current: { period, clicks, impressions, avgCtrPercent, avgPosition }, previous: { ... }, delta: { clicks: '+120 (+15.3%)', impressions, avgCtrPercent: '+0.4pp', avgPosition: '-1.2 pos' } }. Positive position delta = ranking dropped.",
  {
    slug: z.string().describe("Project slug"),
    days: z.number().int().min(1).max(90).default(30).describe("Size of each period in days (default 30)"),
  },
  async ({ slug, days }) => {
    const projects = await readProjects();
    const project = findProject(projects, slug);
    if (!project) {
      return { content: [{ type: "text", text: `Project "${slug}" not found.` }] };
    }
    if (!project.gscProperty) {
      return { content: [{ type: "text", text: `Project "${slug}" has no GSC property configured.` }] };
    }

    const currentEnd = yesterday();
    const currentStart = daysAgo(days);
    const previousEnd = daysAgo(days + 1);
    const previousStart = daysAgo(days * 2 + 1);

    const [current, previous] = await Promise.all([
      syncGscProject(project, currentStart, currentEnd),
      syncGscProject(project, previousStart, previousEnd),
    ]);

    function periodMetrics(snapshots: typeof current.snapshots) {
      const clicks = snapshots.reduce((s, r) => s + (r.clicks ?? 0), 0);
      const impressions = snapshots.reduce((s, r) => s + (r.impressions ?? 0), 0);
      const avgCtr = impressions > 0 ? clicks / impressions : 0;
      const avgPosition = snapshots.length > 0
        ? snapshots.reduce((s, r) => s + (r.avgPosition ?? 0), 0) / snapshots.length
        : 0;
      return { clicks, impressions, avgCtrPercent: parseFloat((avgCtr * 100).toFixed(2)), avgPosition: parseFloat(avgPosition.toFixed(1)) };
    }

    function pct(curr: number, prev: number) {
      if (prev === 0) return curr > 0 ? "+∞%" : "0%";
      return `${((curr - prev) / prev * 100).toFixed(1)}%`;
    }

    const curr = periodMetrics(current.snapshots);
    const prev = periodMetrics(previous.snapshots);

    const output = {
      project: project.name,
      current: { period: { startDate: currentStart, endDate: currentEnd }, ...curr },
      previous: { period: { startDate: previousStart, endDate: previousEnd }, ...prev },
      delta: {
        clicks: `${curr.clicks - prev.clicks} (${pct(curr.clicks, prev.clicks)})`,
        impressions: `${curr.impressions - prev.impressions} (${pct(curr.impressions, prev.impressions)})`,
        avgCtrPercent: `${(curr.avgCtrPercent - prev.avgCtrPercent).toFixed(2)}pp`,
        avgPosition: `${(curr.avgPosition - prev.avgPosition).toFixed(1)} pos`,
      },
    };

    return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
