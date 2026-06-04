import { dateRange, nowIso } from "@/lib/dates";
import { createId } from "@/lib/id";
import type { AppData, MetricSnapshot, PageMetric, Project, SearchQueryMetric } from "@/lib/types";

const createdAt = nowIso();

export function createDemoData(): AppData {
  const projects: Project[] = [
    {
      id: "project_vitaromagna",
      name: "VitaRomagna",
      slug: "vitaromagna",
      type: "web",
      category: "Travel",
      websiteUrl: "https://example.com",
      gscProperty: "sc-domain:example.com",
      umamiWebsiteId: "demo-vitaromagna",
      notes: "Progetto demo per opportunita' SEO locali.",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "project_openfindability",
      name: "OpenFindability",
      slug: "openfindability",
      type: "web",
      category: "Tooling",
      websiteUrl: "https://openfindability.local",
      gscProperty: "https://openfindability.local/",
      umamiWebsiteId: "demo-openfindability",
      notes: "Dashboard demo del prodotto.",
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const dates = dateRange(35);
  const metricSnapshots: MetricSnapshot[] = [];
  const searchQueries: SearchQueryMetric[] = [];
  const pageMetrics: PageMetric[] = [];

  for (const [projectIndex, project] of projects.entries()) {
    dates.forEach((date, dateIndex) => {
      const growth = dateIndex * (projectIndex + 2);
      const clicks = 45 + growth + Math.round(Math.sin(dateIndex / 3) * 12);
      const impressions = 1600 + growth * 22 + Math.round(Math.cos(dateIndex / 4) * 120);
      const visitors = 180 + growth * 2 + Math.round(Math.sin(dateIndex / 2) * 18);

      metricSnapshots.push({
        id: createId("metric"),
        projectId: project.id,
        source: "gsc",
        date,
        clicks,
        impressions,
        ctr: clicks / impressions,
        avgPosition: 9.5 - projectIndex + Math.sin(dateIndex / 6),
        rawJson: { demo: true },
        createdAt,
      });

      metricSnapshots.push({
        id: createId("metric"),
        projectId: project.id,
        source: "umami",
        date,
        visitors,
        pageviews: Math.round(visitors * 1.8),
        rawJson: { demo: true },
        createdAt,
      });
    });

    const querySeeds = [
      ["eventi romagna weekend", "/eventi", 24, 4200, 0.006, 8.4],
      ["spiagge cani romagna", "/spiagge-cani", 18, 3100, 0.0058, 11.2],
      ["cosa fare a cervia", "/cervia", 96, 5200, 0.018, 4.7],
      ["open source seo dashboard", "/", 31, 1800, 0.017, 7.8],
    ] as const;

    for (const [query, page, clicks, impressions, ctr, avgPosition] of querySeeds) {
      searchQueries.push({
        id: createId("query"),
        projectId: project.id,
        date: dates.at(-1) ?? "",
        query,
        page,
        clicks,
        impressions,
        ctr,
        avgPosition,
        rawJson: { demo: true },
      });
    }

    const pageSeeds = [
      ["/eventi", 145, 9400, 0.015, 7.8],
      ["/spiagge-cani", 28, 5100, 0.0055, 10.9],
      ["/cervia", 210, 8600, 0.024, 4.3],
    ] as const;

    for (const [page, clicks, impressions, ctr, avgPosition] of pageSeeds) {
      pageMetrics.push({
        id: createId("page"),
        projectId: project.id,
        date: dates.at(-1) ?? "",
        page,
        clicks,
        impressions,
        ctr,
        avgPosition,
        rawJson: { demo: true },
      });
    }
  }

  return {
    projects,
    metricSnapshots,
    searchQueries,
    pageMetrics,
    opportunities: [],
    connectorRuns: [],
    appReviews: [],
  };
}
