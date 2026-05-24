import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { syncGscProject } from "@/lib/connectors/gsc";
import { syncUmamiProject } from "@/lib/connectors/umami";
import type { AppData, Project } from "@/lib/types";

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

const server = new McpServer({
  name: "openfindability",
  version: "0.1.0",
});

server.tool(
  "list_projects",
  "List all projects configured in OpenFindability with their slugs and connector info.",
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
  "Fetch fresh Google Search Console data for a project. Returns daily snapshots, top queries, and top pages.",
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
  "Fetch fresh Umami analytics for a project for a specific date.",
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
  "Get stored SEO opportunities for a project (computed from last sync).",
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
