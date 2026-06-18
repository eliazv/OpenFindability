import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getAsoCachedRows,
  getFreshAsoCachedRows,
  missingKeywordCountryPairs,
  upsertAsoCacheRows,
  type AsoCachedRow,
} from "@/lib/aso-cache";
import { searchRespectAsoKeywords } from "@/lib/connectors/aso";
import { aggregatePagesByUrl, aggregateQueriesByText } from "@/lib/report";
import { readData, updateData } from "@/lib/store";
import type { AggregatedRow } from "@/lib/report";
import type { AppData, AppKeywordMetric, PageMetric, Project, SearchQueryMetric } from "@/lib/types";

export type AsoSeoResearchOptions = {
  slug: string;
  outputSlug?: string;
  title?: string;
  gscSlug?: string;
  keywords: string[];
  countries: string[];
  respectAsoAppId?: number;
  urlContains: string[];
  queryContains: string[];
  outputDir?: string;
  cacheMaxAgeDays?: number;
  forceRefresh?: boolean;
};

type GscSlice = {
  project: Project;
  queries: SearchQueryMetric[];
  pages: PageMetric[];
  queryRows: AggregatedRow[];
  pageRows: AggregatedRow[];
  rangeStart: string;
  rangeEnd: string;
};

export async function writeAsoSeoResearchReport(options: AsoSeoResearchOptions): Promise<string> {
  const data = await readData();
  const project = findProject(data, options.slug);
  const gscProject = findProject(data, options.gscSlug ?? options.slug);
  const countries = options.countries.length > 0 ? options.countries : project.asoCountries ?? ["it"];
  const keywords = uniqueKeywords([...(project.asoKeywords ?? []), ...options.keywords]);
  const appId = options.respectAsoAppId ?? project.respectAsoAppId ?? project.appStoreTrackId;

  const gsc = buildGscSlice(data, gscProject, options.urlContains, options.queryContains);
  const asoRows = await fetchAsoRows(data, {
    keywords,
    countries,
    projectId: project.id,
    appId,
    cacheMaxAgeDays: options.cacheMaxAgeDays ?? 14,
    forceRefresh: options.forceRefresh ?? false,
  });

  const report = buildAsoSeoResearchMarkdown({
    project,
    title: options.title,
    gsc,
    keywords,
    countries,
    appId,
    asoRows,
    urlContains: options.urlContains,
    queryContains: options.queryContains,
  });

  const today = new Date().toISOString().slice(0, 10);
  const outputSlug = options.outputSlug ?? project.slug;
  const outputDir = options.outputDir ?? path.join(process.cwd(), "project", outputSlug, "reports");
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${today}-aso-seo-research.md`);
  await writeFile(filePath, report, "utf8");
  return filePath;
}

function findProject(data: AppData, slug: string): Project {
  const project = data.projects.find((candidate) => candidate.slug === slug);
  if (!project) {
    throw new Error(`No project found with slug "${slug}". Configured slugs: ${data.projects.map((p) => p.slug).join(", ")}`);
  }
  return project;
}

function uniqueKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))];
}

async function fetchAsoRows(
  data: AppData,
  options: {
    keywords: string[];
    countries: string[];
    projectId: string;
    appId?: number;
    cacheMaxAgeDays: number;
    forceRefresh: boolean;
  },
): Promise<{ rows: AsoCachedRow[]; note?: string }> {
  if (options.keywords.length === 0) {
    return { rows: [], note: "No ASO keywords were provided." };
  }

  const freshRows = options.forceRefresh
    ? []
    : getFreshAsoCachedRows(data, {
        keywords: options.keywords,
        countries: options.countries,
        projectId: options.projectId,
        appId: options.appId,
        maxAgeDays: options.cacheMaxAgeDays,
      });
  const staleRows = getAsoCachedRows(data, {
    keywords: options.keywords,
    countries: options.countries,
    projectId: options.projectId,
    appId: options.appId,
    maxAgeDays: options.cacheMaxAgeDays,
  }).filter((row) => row.cacheStatus === "stale_cache");

  const missing = missingKeywordCountryPairs(options.keywords, options.countries, freshRows);
  if (missing.keywords.length === 0) {
    return { rows: sortKeywordRows(freshRows) };
  }

  try {
    const response = await searchRespectAsoKeywords({
      keywords: missing.keywords,
      countries: missing.countries,
      appId: options.appId,
    });
    const today = new Date().toISOString().slice(0, 10);
    const createdAt = new Date().toISOString();
    const rows: AsoCachedRow[] = [];

    for (const [country, countryRows] of Object.entries(response.results_by_country ?? {})) {
      for (const row of countryRows) {
        rows.push({
          id: `research_${country}_${row.keyword}`,
          projectId: "research",
          date: today,
          keyword: row.keyword,
          country,
          popularityScore: row.popularity_score ?? 0,
          difficultyScore: row.difficulty_score ?? 0,
          opportunityScore: row.opportunity_score ?? 0,
          difficultyLabel: row.difficulty_label,
          classification: row.classification,
          appRank: row.app_rank ?? null,
          rawJson: row,
          createdAt,
          cacheStatus: "live",
          observedAt: createdAt,
        });
      }
    }

    const liveMissing = missingKeywordCountryPairs(missing.keywords, missing.countries, rows);
    const historyRows =
      liveMissing.keywords.length > 0
        ? await fetchRespectAsoHistoryRows(liveMissing.keywords, liveMissing.countries, options.appId, options.projectId)
        : [];
    const fetchedRows = mergeKeywordRows(rows, historyRows);

    if (fetchedRows.length > 0) {
      await updateData((current) => {
        upsertAsoCacheRows(current, fetchedRows, {
          projectId: options.projectId,
          appId: options.appId,
          observedAt: createdAt,
        });
      });
    }

    const fallbackRows = fetchedRows.length > 0 ? [] : staleRows;
    return { rows: sortKeywordRows(mergeKeywordRows([...freshRows, ...fallbackRows], fetchedRows)) };
  } catch (error) {
    const historyRows = await fetchRespectAsoHistoryRows(
      missing.keywords,
      missing.countries,
      options.appId,
      options.projectId,
    );
    if (historyRows.length > 0) {
      const observedAt = new Date().toISOString();
      await updateData((current) => {
        upsertAsoCacheRows(current, historyRows, {
          projectId: options.projectId,
          appId: options.appId,
          observedAt,
        });
      });
      return {
        rows: sortKeywordRows(mergeKeywordRows(freshRows, historyRows)),
        note: `Live RespectASO lookup failed; using cached history. ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    if (staleRows.length > 0) {
      return {
        rows: sortKeywordRows(mergeKeywordRows(freshRows, staleRows)),
        note: `Live RespectASO lookup failed; using stale cache. ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return { rows: freshRows, note: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchRespectAsoHistoryRows(
  keywords: string[],
  countries: string[],
  appId?: number,
  projectId = "research",
): Promise<AsoCachedRow[]> {
  const baseUrl = process.env.RESPECT_ASO_BASE_URL ?? "http://localhost";
  const params = new URLSearchParams();
  if (appId) params.set("app_id", String(appId));
  if (countries.length === 1) params.set("country", countries[0]);

  const response = await fetch(`${baseUrl}/export/history.csv${params.size > 0 ? `?${params.toString()}` : ""}`);
  if (!response.ok) return [];

  const keywordSet = new Set(keywords.map((keyword) => keyword.toLowerCase()));
  const countrySet = new Set(countries.map((country) => country.toUpperCase()));
  const rows = parseCsv(await response.text());
  const latestByKey = new Map<string, AsoCachedRow>();

  for (const row of rows) {
    const keyword = row.Keyword?.trim();
    const country = row.Country?.trim().toUpperCase();
    if (!keyword || !country || !keywordSet.has(keyword.toLowerCase()) || !countrySet.has(country)) continue;

    const date = row.Date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const metric: AsoCachedRow = {
      id: `history_${country}_${keyword}`,
      projectId,
      date,
      keyword,
      country: country.toLowerCase(),
      popularityScore: Number(row.Popularity ?? 0),
      difficultyScore: Number(row.Difficulty ?? 0),
      opportunityScore: estimateOpportunity(Number(row.Popularity ?? 0), Number(row.Difficulty ?? 0)),
      difficultyLabel: row["Difficulty Label"],
      classification: "cached_history",
      appRank: row.Rank ? Number(row.Rank) : null,
      rawJson: row,
      createdAt: new Date().toISOString(),
      cacheStatus: "history",
      observedAt: row.Date ? new Date(row.Date).toISOString() : new Date().toISOString(),
    };

    const key = `${country}:${keyword.toLowerCase()}`;
    const existing = latestByKey.get(key);
    if (!existing || metric.date >= existing.date) latestByKey.set(key, metric);
  }

  return [...latestByKey.values()];
}

function parseCsv(csv: string): Record<string, string>[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function estimateOpportunity(popularity: number, difficulty: number): number {
  if (popularity <= 0) return 0;
  return Math.max(0, Math.round(popularity * (1 - difficulty / 100)));
}

function mergeKeywordRows<T extends { keyword: string; country: string; observedAt?: string }>(primary: T[], fallback: T[]): T[] {
  const rows = new Map<string, T>();
  for (const row of fallback) rows.set(`${row.country}:${row.keyword.toLowerCase()}`, row);
  for (const row of primary) {
    const key = `${row.country}:${row.keyword.toLowerCase()}`;
    const existing = rows.get(key);
    if (!existing || (row.observedAt ?? "") >= (existing.observedAt ?? "")) rows.set(key, row);
  }
  return [...rows.values()];
}

function sortKeywordRows<T extends AppKeywordMetric>(rows: T[]): T[] {
  return rows.sort(
    (a, b) =>
      b.opportunityScore - a.opportunityScore ||
      b.popularityScore - a.popularityScore ||
      a.keyword.localeCompare(b.keyword),
  );
}

function buildGscSlice(data: AppData, project: Project, urlContains: string[], queryContains: string[]): GscSlice {
  const normalizedUrlContains = urlContains.map(normalizeNeedle);
  const normalizedQueryContains = queryContains.map(normalizeNeedle);

  const queries = data.searchQueries.filter((row) => {
    if (row.projectId !== project.id) return false;
    const query = normalizeNeedle(row.query);
    const page = normalizeNeedle(row.page ?? "");
    return (
      normalizedQueryContains.some((needle) => query.includes(needle)) ||
      normalizedUrlContains.some((needle) => page.includes(needle))
    );
  });

  const pages = data.pageMetrics.filter((row) => {
    if (row.projectId !== project.id) return false;
    const page = normalizeNeedle(row.page);
    return normalizedUrlContains.some((needle) => page.includes(needle));
  });

  const dates = [...new Set([...queries.map((row) => row.date), ...pages.map((row) => row.date)])].sort();

  return {
    project,
    queries,
    pages,
    queryRows: aggregateQueriesByText(queries),
    pageRows: aggregatePagesByUrl(pages),
    rangeStart: dates[0] ?? "n/a",
    rangeEnd: dates[dates.length - 1] ?? "n/a",
  };
}

function normalizeNeedle(value: string): string {
  return value.trim().toLowerCase();
}

function buildAsoSeoResearchMarkdown(input: {
  project: Project;
  title?: string;
  gsc: GscSlice;
  keywords: string[];
  countries: string[];
  appId?: number;
  asoRows: { rows: AsoCachedRow[]; note?: string };
  urlContains: string[];
  queryContains: string[];
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const topAso = input.asoRows.rows.slice(0, 40);
  const topQueries = input.gsc.queryRows.slice(0, 30);
  const topPages = input.gsc.pageRows.slice(0, 20);
  const title = input.title ?? input.project.name;

  const lines: string[] = [];
  lines.push(`# ${title} - ASO + SEO research - ${today}`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("```txt");
  lines.push(`Project: ${input.project.slug}`);
  lines.push(`GSC project: ${input.gsc.project.slug} (${input.gsc.project.gscProperty ?? "not configured"})`);
  lines.push(`RespectASO app id: ${input.appId ?? "not configured"}`);
  lines.push(`Countries: ${input.countries.join(", ")}`);
  lines.push(`Keyword candidates: ${input.keywords.length}`);
  lines.push(`URL filters: ${input.urlContains.join(", ") || "(none)"}`);
  lines.push(`Query filters: ${input.queryContains.join(", ") || "(none)"}`);
  lines.push("```");
  lines.push("");

  lines.push("## ASO keyword results");
  lines.push("");
  if (input.asoRows.note) {
    lines.push("```txt");
    lines.push(`ASO lookup note: ${input.asoRows.note}`);
    lines.push("```");
    lines.push("");
  }

  if (topAso.length === 0) {
    lines.push("```txt");
    lines.push("RespectASO returned no keyword rows for this input.");
    lines.push("```");
  } else {
    lines.push("| Keyword | Country | Pop | Diff | Opp | Class | Rank | Source | Observed |");
    lines.push("| --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |");
    for (const row of topAso) {
      lines.push(
        `| ${row.keyword} | ${row.country.toUpperCase()} | ${row.popularityScore} | ${row.difficultyScore} | ${row.opportunityScore} | ${
          row.classification ?? "-"
        } | ${row.appRank == null ? "-" : row.appRank} | ${row.cacheStatus} | ${row.observedAt.slice(0, 10)} |`,
      );
    }
  }
  lines.push("");

  lines.push("## GSC filtered demand");
  lines.push("");
  lines.push("```txt");
  lines.push(`Period: ${input.gsc.rangeStart} -> ${input.gsc.rangeEnd}`);
  lines.push(`Matched query rows: ${input.gsc.queries.length}`);
  lines.push(`Matched page rows: ${input.gsc.pages.length}`);
  lines.push("```");
  lines.push("");

  lines.push("### Top GSC queries");
  lines.push("");
  if (topQueries.length === 0) {
    lines.push("```txt");
    lines.push("No matching GSC query rows.");
    lines.push("```");
  } else {
    lines.push("| Query | Clicks | Impressions | CTR | Avg position |");
    lines.push("| --- | ---: | ---: | ---: | ---: |");
    for (const row of topQueries) {
      lines.push(
        `| ${row.key} | ${row.clicks} | ${row.impressions} | ${(row.ctr * 100).toFixed(2)}% | ${row.avgPosition.toFixed(1)} |`,
      );
    }
  }
  lines.push("");

  lines.push("### Top GSC pages");
  lines.push("");
  if (topPages.length === 0) {
    lines.push("```txt");
    lines.push("No matching GSC page rows.");
    lines.push("```");
  } else {
    lines.push("| Page | Clicks | Impressions | CTR | Avg position |");
    lines.push("| --- | ---: | ---: | ---: | ---: |");
    for (const row of topPages) {
      lines.push(
        `| ${row.key} | ${row.clicks} | ${row.impressions} | ${(row.ctr * 100).toFixed(2)}% | ${row.avgPosition.toFixed(1)} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Working notes");
  lines.push("");
  lines.push("- Use ASO rows to choose store metadata targets.");
  lines.push("- Use GSC rows to capture real user language for descriptions, screenshots and landing pages.");
  lines.push("- Avoid high-volume unrelated competitor-game keywords unless the app genuinely supports that game.");
  lines.push("- If ranks are empty while the App Store listing exists, configure `respectAsoAppId` with the internal RespectASO app id.");
  lines.push("");

  return lines.join("\n");
}
