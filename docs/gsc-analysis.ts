/**
 * VitaRomagna - GSC deep analysis
 *
 * Focus:
 * - brand vs non-brand
 * - current period vs previous period
 * - CTR opportunities by page/query
 * - near-top ranking opportunities
 * - query cannibalization
 * - cross-check with Umami top pages
 *
 * Usage:
 *   npx tsx scripts/gsc-analysis.ts
 *   npx tsx scripts/gsc-analysis.ts --days 28
 *   npx tsx scripts/gsc-analysis.ts --env local
 *   npx tsx scripts/gsc-analysis.ts --report
 */

import { google, searchconsole_v1 } from "googleapis";
import * as fs from "fs";
import * as path from "path";

const DAYS = (() => {
  const index = process.argv.indexOf("--days");
  if (index === -1) return 30;
  const parsed = Number.parseInt(process.argv[index + 1] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
})();

const USE_LOCAL =
  process.argv.includes("--env") &&
  process.argv[process.argv.indexOf("--env") + 1] === "local";
const WRITE_REPORT = process.argv.includes("--report");

const ENV_FILE = path.join(process.cwd(), USE_LOCAL ? ".env.local" : ".env.production");
const SC_KEY_FILE = path.join(
  process.cwd(),
  "sensibili/google cloud/vitaromagna-68d1f2372cda.json",
);
const SC_SITE = "sc-domain:vitaromagna.it";
const UMAMI_API = "https://api.umami.is/v1";
const UMAMI_WEBSITE_ID = "bbb95d31-17a4-40cb-a9f7-121c084c0658";
const REPORT_DIR = path.join(process.cwd(), "doc/11-report-statistiche");

const BRAND_TERMS = [
  "vita romagna",
  "vitaromagna",
  "vitaromagna.it",
  "vita-romagna",
  "vita romagna it",
];

type Range = {
  start: string;
  end: string;
  startMs: number;
  endMs: number;
};

type MetricRow = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type PageMetric = MetricRow & {
  url: string;
};

type QueryMetric = MetricRow & {
  query: string;
  isBrand: boolean;
};

type PageQueryMetric = MetricRow & {
  url: string;
  query: string;
  isBrand: boolean;
};

type OpportunityRow = {
  label: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  potentialClicks: number;
  note: string;
};

type CannibalizationRow = {
  query: string;
  impressions: number;
  clicks: number;
  topPages: Array<{
    url: string;
    clicks: number;
    impressions: number;
    position: number;
  }>;
};

type UmamiPage = {
  url: string;
  views: number;
};

type AnalysisData = {
  current: Range;
  previous: Range;
  totalsCurrent: MetricRow;
  totalsPrevious: MetricRow;
  queryCurrent: QueryMetric[];
  queryPrevious: QueryMetric[];
  pageCurrent: PageMetric[];
  pagePrevious: PageMetric[];
  pageQueryCurrent: PageQueryMetric[];
  umamiPages: UmamiPage[];
};

function loadEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [
          line.slice(0, index).trim(),
          line.slice(index + 1).trim().replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

const env = loadEnv(ENV_FILE);

function cleanUrl(url: string) {
  return (url ?? "")
    .replace("https://www.vitaromagna.it", "")
    .replace("https://vitaromagna.it", "") || "/";
}

function normalizePath(url: string) {
  const pathOnly = cleanUrl(url).split("?")[0] || "/";
  return pathOnly === "" ? "/" : pathOnly;
}

function isBrandQuery(query: string) {
  const normalized = query.toLowerCase().trim();
  return BRAND_TERMS.some((term) => normalized.includes(term));
}

function fmtDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function buildDateRange(days: number, offsetDays = 0): Range {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 1 - offsetDays);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return {
    start: fmtDate(start),
    end: fmtDate(end),
    startMs: start.getTime(),
    endMs: end.getTime(),
  };
}

function num(value: number) {
  return Math.round(value).toLocaleString("it");
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function deltaPct(currentValue: number, previousValue: number) {
  if (previousValue === 0 && currentValue === 0) return "0.0%";
  if (previousValue === 0) return "+inf";
  const delta = ((currentValue - previousValue) / previousValue) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

function expectedCtrForPosition(position: number) {
  if (position <= 1.5) return 28;
  if (position <= 2.5) return 17;
  if (position <= 3.5) return 11;
  if (position <= 5) return 7;
  if (position <= 8) return 4;
  if (position <= 10) return 3;
  if (position <= 15) return 1.5;
  return 0.8;
}

function computePotentialClicks(impressions: number, actualCtr: number, position: number) {
  const targetCtr = expectedCtrForPosition(position);
  const ctrGap = Math.max(0, targetCtr - actualCtr);
  return Math.round((impressions * ctrGap) / 100);
}

function averagePosition(rows: MetricRow[]) {
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  if (impressions === 0) return 0;
  const weighted = rows.reduce((sum, row) => sum + row.position * row.impressions, 0);
  return weighted / impressions;
}

function aggregateMetrics(rows: MetricRow[]): MetricRow {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    position: averagePosition(rows),
  };
}

function mergeMetricRows<T extends MetricRow>(
  rows: T[],
  getKey: (row: T) => string,
  createBase: (row: T) => Omit<T, keyof MetricRow>,
): T[] {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  return [...grouped.entries()].map(([, bucket]) => {
    const totals = aggregateMetrics(bucket);
    return {
      ...createBase(bucket[0]),
      ...totals,
    } as T;
  });
}

async function fetchAllRows(
  sc: searchconsole_v1.Searchconsole,
  range: Range,
  dimensions: string[],
): Promise<searchconsole_v1.Schema$ApiDataRow[]> {
  const allRows: searchconsole_v1.Schema$ApiDataRow[] = [];
  const rowLimit = 25000;
  let startRow = 0;

  while (true) {
    const res = await sc.searchanalytics.query({
      siteUrl: SC_SITE,
      requestBody: {
        startDate: range.start,
        endDate: range.end,
        dimensions,
        rowLimit,
        startRow,
      },
    });

    const rows = res.data.rows ?? [];
    allRows.push(...rows);
    if (rows.length < rowLimit) break;
    startRow += rowLimit;
  }

  return allRows;
}

async function fetchTotals(sc: searchconsole_v1.Searchconsole, range: Range): Promise<MetricRow> {
  const res = await sc.searchanalytics.query({
    siteUrl: SC_SITE,
    requestBody: {
      startDate: range.start,
      endDate: range.end,
      dimensions: ["date"],
      rowLimit: 1000,
    },
  });

  const rows = (res.data.rows ?? []).map((row) => ({
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: (row.ctr ?? 0) * 100,
    position: row.position ?? 0,
  }));

  return aggregateMetrics(rows);
}

async function fetchUmamiPages(range: Range): Promise<UmamiPage[]> {
  const apiKey = env["UMAMI_API_KEY"];
  if (!apiKey) return [];

  const headers = {
    "x-umami-api-key": apiKey,
    "Content-Type": "application/json",
  };
  const qs = `startAt=${range.startMs}&endAt=${range.endMs}`;
  const res = await fetch(
    `${UMAMI_API}/websites/${UMAMI_WEBSITE_ID}/metrics?${qs}&type=url&limit=25`,
    { headers },
  );

  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ x: string; y: number }>;
  return rows.map((row) => ({
    url: normalizePath(row.x),
    views: row.y,
  }));
}

function toPageMetrics(rows: searchconsole_v1.Schema$ApiDataRow[]): PageMetric[] {
  return mergeMetricRows(
    rows.map((row) => ({
      url: normalizePath(row.keys?.[0] ?? "/"),
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: (row.ctr ?? 0) * 100,
      position: row.position ?? 0,
    })),
    (row) => row.url,
    (row) => ({ url: row.url }),
  );
}

function toQueryMetrics(rows: searchconsole_v1.Schema$ApiDataRow[]): QueryMetric[] {
  return mergeMetricRows(
    rows.map((row) => {
      const query = row.keys?.[0] ?? "";
      return {
        query,
        isBrand: isBrandQuery(query),
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: (row.ctr ?? 0) * 100,
        position: row.position ?? 0,
      };
    }),
    (row) => row.query,
    (row) => ({ query: row.query, isBrand: row.isBrand }),
  );
}

function toPageQueryMetrics(rows: searchconsole_v1.Schema$ApiDataRow[]): PageQueryMetric[] {
  return mergeMetricRows(
    rows.map((row) => {
      const query = row.keys?.[0] ?? "";
      return {
        query,
        url: normalizePath(row.keys?.[1] ?? "/"),
        isBrand: isBrandQuery(query),
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: (row.ctr ?? 0) * 100,
        position: row.position ?? 0,
      };
    }),
    (row) => `${row.query}::${row.url}`,
    (row) => ({ query: row.query, url: row.url, isBrand: row.isBrand }),
  );
}

function topRows<T>(rows: T[], limit: number, sorter: (a: T, b: T) => number) {
  return [...rows].sort(sorter).slice(0, limit);
}

function buildLowCtrPageOpportunities(rows: PageMetric[]) {
  return topRows(
    rows
      .filter((row) => row.impressions >= 200 && row.position <= 10)
      .map((row) => ({
        label: row.url,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        potentialClicks: computePotentialClicks(row.impressions, row.ctr, row.position),
        note: "title/snippet",
      }))
      .filter((row) => row.potentialClicks >= 15),
    15,
    (a, b) => b.potentialClicks - a.potentialClicks,
  );
}

function buildLowCtrQueryOpportunities(rows: QueryMetric[]) {
  return topRows(
    rows
      .filter((row) => !row.isBrand && row.impressions >= 150 && row.position <= 10)
      .map((row) => ({
        label: row.query,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        potentialClicks: computePotentialClicks(row.impressions, row.ctr, row.position),
        note: "query intent mismatch",
      }))
      .filter((row) => row.potentialClicks >= 10),
    15,
    (a, b) => b.potentialClicks - a.potentialClicks,
  );
}

function buildNearTopPages(rows: PageMetric[]) {
  return topRows(
    rows
      .filter((row) => row.impressions >= 120 && row.position > 3 && row.position <= 12)
      .map((row) => ({
        label: row.url,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        potentialClicks: Math.round(row.impressions * 0.03),
        note: "push to top 3",
      })),
    15,
    (a, b) => b.impressions - a.impressions,
  );
}

function buildPage2Queries(rows: QueryMetric[]) {
  return topRows(
    rows.filter((row) => !row.isBrand && row.impressions >= 100 && row.position > 10 && row.position <= 20),
    15,
    (a, b) => b.impressions - a.impressions,
  );
}

function buildZeroClickQueries(rows: QueryMetric[]) {
  return topRows(
    rows.filter((row) => !row.isBrand && row.clicks === 0 && row.impressions >= 80 && row.position <= 15),
    15,
    (a, b) => b.impressions - a.impressions,
  );
}

function buildCannibalization(rows: PageQueryMetric[]): CannibalizationRow[] {
  const grouped = new Map<string, PageQueryMetric[]>();
  for (const row of rows) {
    if (row.isBrand || row.impressions < 60) continue;
    const current = grouped.get(row.query) ?? [];
    current.push(row);
    grouped.set(row.query, current);
  }

  const output: CannibalizationRow[] = [];
  for (const [query, queryRows] of grouped.entries()) {
    const distinctPages = new Map<string, PageQueryMetric>();
    for (const row of queryRows) {
      const existing = distinctPages.get(row.url);
      if (!existing || existing.impressions < row.impressions) {
        distinctPages.set(row.url, row);
      }
    }
    const pages = [...distinctPages.values()].sort((a, b) => b.impressions - a.impressions);
    if (pages.length < 2) continue;
    if (pages[1].impressions < pages[0].impressions * 0.25) continue;

    output.push({
      query,
      impressions: queryRows.reduce((sum, row) => sum + row.impressions, 0),
      clicks: queryRows.reduce((sum, row) => sum + row.clicks, 0),
      topPages: pages.slice(0, 3).map((page) => ({
        url: page.url,
        clicks: page.clicks,
        impressions: page.impressions,
        position: page.position,
      })),
    });
  }

  return output.sort((a, b) => b.impressions - a.impressions).slice(0, 12);
}

function buildTopPageIntents(rows: PageQueryMetric[], pageMetrics: PageMetric[]) {
  const topPages = topRows(
    pageMetrics.filter((row) => row.clicks > 0),
    8,
    (a, b) => b.clicks - a.clicks,
  );

  return topPages.map((page) => ({
    page: page.url,
    clicks: page.clicks,
    position: page.position,
    queries: topRows(
      rows.filter((row) => row.url === page.url),
      6,
      (a, b) => b.impressions - a.impressions,
    ),
  }));
}

function buildUmamiCross(rows: PageMetric[], umamiPages: UmamiPage[]) {
  const umamiMap = new Map(umamiPages.map((row) => [row.url, row.views]));
  return topRows(
    rows
      .filter((row) => umamiMap.has(row.url))
      .map((row) => ({
        ...row,
        views: umamiMap.get(row.url) ?? 0,
      })),
    12,
    (a, b) => b.views - a.views,
  );
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

function printOpportunityTable(rows: OpportunityRow[]) {
  if (rows.length === 0) {
    console.log("  Nessuna opportunita rilevante.");
    return;
  }
  for (const row of rows) {
    console.log(
      `  ${row.label.slice(0, 64).padEnd(64)} imp:${String(row.impressions).padStart(6)} CTR:${row.ctr
        .toFixed(1)
        .padStart(5)}% pos:${row.position.toFixed(1).padStart(5)} +click:${String(
        row.potentialClicks,
      ).padStart(4)}  ${row.note}`,
    );
  }
}

function printQueryRows(rows: QueryMetric[]) {
  if (rows.length === 0) {
    console.log("  Nessuna query rilevante.");
    return;
  }
  for (const row of rows) {
    console.log(
      `  ${row.query.slice(0, 58).padEnd(58)} imp:${String(row.impressions).padStart(6)} CTR:${row.ctr
        .toFixed(1)
        .padStart(5)}% pos:${row.position.toFixed(1).padStart(5)}`,
    );
  }
}

function printCannibalization(rows: CannibalizationRow[]) {
  if (rows.length === 0) {
    console.log("  Nessun caso forte di cannibalizzazione.");
    return;
  }

  for (const row of rows) {
    console.log(
      `  QUERY: ${row.query}  imp:${row.impressions} click:${row.clicks}`,
    );
    for (const page of row.topPages) {
      console.log(
        `    - ${page.url}  imp:${page.impressions} click:${page.clicks} pos:${page.position.toFixed(1)}`,
      );
    }
  }
}

function writeMarkdownReport(data: AnalysisData) {
  const nonBrandCurrent = data.queryCurrent.filter((row) => !row.isBrand);
  const brandCurrent = data.queryCurrent.filter((row) => row.isBrand);
  const nonBrandPrevious = data.queryPrevious.filter((row) => !row.isBrand);
  const brandPrevious = data.queryPrevious.filter((row) => row.isBrand);

  const nonBrandTotalsCurrent = aggregateMetrics(nonBrandCurrent);
  const brandTotalsCurrent = aggregateMetrics(brandCurrent);
  const nonBrandTotalsPrevious = aggregateMetrics(nonBrandPrevious);
  const brandTotalsPrevious = aggregateMetrics(brandPrevious);

  const pageOpportunities = buildLowCtrPageOpportunities(data.pageCurrent);
  const queryOpportunities = buildLowCtrQueryOpportunities(data.queryCurrent);
  const nearTop = buildNearTopPages(data.pageCurrent);
  const page2 = buildPage2Queries(data.queryCurrent);
  const zeroClick = buildZeroClickQueries(data.queryCurrent);
  const cannibalization = buildCannibalization(data.pageQueryCurrent);
  const topPageIntents = buildTopPageIntents(data.pageQueryCurrent, data.pageCurrent);
  const umamiCross = buildUmamiCross(data.pageCurrent, data.umamiPages);

  const today = new Date().toISOString().split("T")[0];
  const lines: string[] = [];
  const p = (...args: string[]) => lines.push(...args);

  p(
    `# GSC Deep Analysis - ${today}`,
    ``,
    `> Periodo analizzato: **${data.current.start}** -> **${data.current.end}** (${DAYS} giorni)`,
    `> Periodo confronto: **${data.previous.start}** -> **${data.previous.end}**`,
    `> Ambiente: **${USE_LOCAL ? "LOCAL" : "PRODUCTION"}**`,
    `> Nota: brand/non-brand usa solo le query visibili in GSC e puo non coincidere col totale assoluto.`,
    ``,
    `## Executive Summary`,
    ``,
    `| Segmento | Click | Impressioni | CTR | Posizione | Delta click |`,
    `|---|---:|---:|---:|---:|---:|`,
    `| Totale | ${num(data.totalsCurrent.clicks)} | ${num(data.totalsCurrent.impressions)} | ${pct(data.totalsCurrent.ctr)} | ${data.totalsCurrent.position.toFixed(1)} | ${deltaPct(data.totalsCurrent.clicks, data.totalsPrevious.clicks)} |`,
    `| Non-brand | ${num(nonBrandTotalsCurrent.clicks)} | ${num(nonBrandTotalsCurrent.impressions)} | ${pct(nonBrandTotalsCurrent.ctr)} | ${nonBrandTotalsCurrent.position.toFixed(1)} | ${deltaPct(nonBrandTotalsCurrent.clicks, nonBrandTotalsPrevious.clicks)} |`,
    `| Brand | ${num(brandTotalsCurrent.clicks)} | ${num(brandTotalsCurrent.impressions)} | ${pct(brandTotalsCurrent.ctr)} | ${brandTotalsCurrent.position.toFixed(1)} | ${deltaPct(brandTotalsCurrent.clicks, brandTotalsPrevious.clicks)} |`,
    ``,
    `## Pagine con piu potenziale CTR`,
    ``,
    `| Pagina | Impressioni | CTR | Posizione | Click potenziali |`,
    `|---|---:|---:|---:|---:|`,
  );

  for (const row of pageOpportunities) {
    p(`| \`${row.label}\` | ${num(row.impressions)} | ${pct(row.ctr)} | ${row.position.toFixed(1)} | ${num(row.potentialClicks)} |`);
  }

  p(
    ``,
    `## Query non-brand con piu potenziale CTR`,
    ``,
    `| Query | Impressioni | CTR | Posizione | Click potenziali |`,
    `|---|---:|---:|---:|---:|`,
  );

  for (const row of queryOpportunities) {
    p(`| ${row.label} | ${num(row.impressions)} | ${pct(row.ctr)} | ${row.position.toFixed(1)} | ${num(row.potentialClicks)} |`);
  }

  p(
    ``,
    `## Pagine quasi top 3`,
    ``,
    `| Pagina | Click | Impressioni | Posizione |`,
    `|---|---:|---:|---:|`,
  );
  for (const row of nearTop) {
    p(`| \`${row.label}\` | ${num(row.clicks)} | ${num(row.impressions)} | ${row.position.toFixed(1)} |`);
  }

  p(
    ``,
    `## Query in pagina 2`,
    ``,
    `| Query | Impressioni | Posizione | CTR |`,
    `|---|---:|---:|---:|`,
  );
  for (const row of page2) {
    p(`| ${row.query} | ${num(row.impressions)} | ${row.position.toFixed(1)} | ${pct(row.ctr)} |`);
  }

  p(
    ``,
    `## Query con 0 click`,
    ``,
    `| Query | Impressioni | Posizione |`,
    `|---|---:|---:|`,
  );
  for (const row of zeroClick) {
    p(`| ${row.query} | ${num(row.impressions)} | ${row.position.toFixed(1)} |`);
  }

  p(
    ``,
    `## Cannibalizzazione query -> piu URL`,
    ``,
  );
  for (const row of cannibalization) {
    p(`### ${row.query}`, ``);
    p(`Totale impressioni: **${num(row.impressions)}** - click: **${num(row.clicks)}**`, ``);
    p(`| Pagina | Impressioni | Click | Posizione |`, `|---|---:|---:|---:|`);
    for (const page of row.topPages) {
      p(`| \`${page.url}\` | ${num(page.impressions)} | ${num(page.clicks)} | ${page.position.toFixed(1)} |`);
    }
    p(``);
  }

  p(`## Query principali per top pagine`, ``);
  for (const item of topPageIntents) {
    p(`### \`${item.page}\``, ``);
    p(`Click pagina: **${num(item.clicks)}** - Posizione media: **${item.position.toFixed(1)}**`, ``);
    p(`| Query | Impressioni | Click | CTR |`, `|---|---:|---:|---:|`);
    for (const query of item.queries) {
      p(`| ${query.query} | ${num(query.impressions)} | ${num(query.clicks)} | ${pct(query.ctr)} |`);
    }
    p(``);
  }

  p(
    `## Cross-check Umami`,
    ``,
    `| Pagina | Pageview Umami | Impressioni GSC | Click GSC | CTR |`,
    `|---|---:|---:|---:|---:|`,
  );
  for (const row of umamiCross) {
    p(`| \`${row.url}\` | ${num(row.views)} | ${num(row.impressions)} | ${num(row.clicks)} | ${pct(row.ctr)} |`);
  }

  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `${today}-gsc-deep.md`);
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(`\nReport salvato -> ${reportPath}`);
}

async function collectAnalysisData(): Promise<AnalysisData> {
  const current = buildDateRange(DAYS, 0);
  const previous = buildDateRange(DAYS, DAYS);

  const key = JSON.parse(fs.readFileSync(SC_KEY_FILE, "utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  const sc = google.searchconsole({ version: "v1", auth });

  const [
    totalsCurrent,
    totalsPrevious,
    queryCurrentRaw,
    queryPreviousRaw,
    pageCurrentRaw,
    pagePreviousRaw,
    pageQueryCurrentRaw,
    umamiPages,
  ] = await Promise.all([
    fetchTotals(sc, current),
    fetchTotals(sc, previous),
    fetchAllRows(sc, current, ["query"]),
    fetchAllRows(sc, previous, ["query"]),
    fetchAllRows(sc, current, ["page"]),
    fetchAllRows(sc, previous, ["page"]),
    fetchAllRows(sc, current, ["query", "page"]),
    fetchUmamiPages(current).catch(() => []),
  ]);

  return {
    current,
    previous,
    totalsCurrent,
    totalsPrevious,
    queryCurrent: toQueryMetrics(queryCurrentRaw),
    queryPrevious: toQueryMetrics(queryPreviousRaw),
    pageCurrent: toPageMetrics(pageCurrentRaw),
    pagePrevious: toPageMetrics(pagePreviousRaw),
    pageQueryCurrent: toPageQueryMetrics(pageQueryCurrentRaw),
    umamiPages,
  };
}

async function main() {
  const data = await collectAnalysisData();
  const nonBrandCurrent = data.queryCurrent.filter((row) => !row.isBrand);
  const brandCurrent = data.queryCurrent.filter((row) => row.isBrand);
  const nonBrandPrevious = data.queryPrevious.filter((row) => !row.isBrand);
  const brandPrevious = data.queryPrevious.filter((row) => row.isBrand);

  const nonBrandTotalsCurrent = aggregateMetrics(nonBrandCurrent);
  const brandTotalsCurrent = aggregateMetrics(brandCurrent);
  const nonBrandTotalsPrevious = aggregateMetrics(nonBrandPrevious);
  const brandTotalsPrevious = aggregateMetrics(brandPrevious);

  const pageOpportunities = buildLowCtrPageOpportunities(data.pageCurrent);
  const queryOpportunities = buildLowCtrQueryOpportunities(data.queryCurrent);
  const nearTop = buildNearTopPages(data.pageCurrent);
  const page2 = buildPage2Queries(data.queryCurrent);
  const zeroClick = buildZeroClickQueries(data.queryCurrent);
  const cannibalization = buildCannibalization(data.pageQueryCurrent);
  const topPageIntents = buildTopPageIntents(data.pageQueryCurrent, data.pageCurrent);
  const umamiCross = buildUmamiCross(data.pageCurrent, data.umamiPages);

  console.log(
    `\nGSC DEEP ANALYSIS - ${data.current.start} -> ${data.current.end} (${DAYS} giorni)\n`,
  );

  section("EXECUTIVE SUMMARY");
  console.log(
    "  Nota: brand/non-brand usa solo le query visibili in GSC; il totale puo includere query anonime/non mostrate.",
  );
  console.log(
    `  Totale      click:${String(data.totalsCurrent.clicks).padStart(6)}  imp:${String(
      data.totalsCurrent.impressions,
    ).padStart(7)}  CTR:${pct(data.totalsCurrent.ctr).padStart(6)}  pos:${data.totalsCurrent.position
      .toFixed(1)
      .padStart(5)}  delta click:${deltaPct(data.totalsCurrent.clicks, data.totalsPrevious.clicks)}`,
  );
  console.log(
    `  Non-brand   click:${String(nonBrandTotalsCurrent.clicks).padStart(6)}  imp:${String(
      nonBrandTotalsCurrent.impressions,
    ).padStart(7)}  CTR:${pct(nonBrandTotalsCurrent.ctr).padStart(6)}  pos:${nonBrandTotalsCurrent.position
      .toFixed(1)
      .padStart(5)}  delta click:${deltaPct(nonBrandTotalsCurrent.clicks, nonBrandTotalsPrevious.clicks)}`,
  );
  console.log(
    `  Brand       click:${String(brandTotalsCurrent.clicks).padStart(6)}  imp:${String(
      brandTotalsCurrent.impressions,
    ).padStart(7)}  CTR:${pct(brandTotalsCurrent.ctr).padStart(6)}  pos:${brandTotalsCurrent.position
      .toFixed(1)
      .padStart(5)}  delta click:${deltaPct(brandTotalsCurrent.clicks, brandTotalsPrevious.clicks)}`,
  );

  section("PAGINE CON PIU POTENZIALE CTR");
  printOpportunityTable(pageOpportunities);

  section("QUERY NON-BRAND CON PIU POTENZIALE CTR");
  printOpportunityTable(queryOpportunities);

  section("PAGINE QUASI TOP 3");
  printOpportunityTable(nearTop);

  section("QUERY IN PAGINA 2");
  printQueryRows(page2);

  section("QUERY CON 0 CLICK");
  printQueryRows(zeroClick);

  section("CANNIBALIZZAZIONE QUERY -> PIU URL");
  printCannibalization(cannibalization);

  section("INTENTI REALI DELLE TOP PAGINE");
  for (const item of topPageIntents) {
    console.log(`  PAGE: ${item.page} (${item.clicks} click, pos ${item.position.toFixed(1)})`);
    for (const query of item.queries) {
      console.log(
        `    ${query.query.slice(0, 48).padEnd(48)} click:${String(query.clicks).padStart(4)} imp:${String(
          query.impressions,
        ).padStart(5)} CTR:${pct(query.ctr).padStart(6)}${query.isBrand ? " brand" : ""}`,
      );
    }
  }

  section("CROSS-CHECK CON UMAMI");
  if (umamiCross.length === 0) {
    console.log("  Dati Umami non disponibili o nessuna sovrapposizione rilevante.");
  } else {
    for (const row of umamiCross) {
      console.log(
        `  ${row.url.slice(0, 56).padEnd(56)} pv:${String(row.views).padStart(6)} imp:${String(
          row.impressions,
        ).padStart(6)} click:${String(row.clicks).padStart(5)} CTR:${pct(row.ctr).padStart(6)}`,
      );
    }
  }

  if (WRITE_REPORT) writeMarkdownReport(data);
}

main().catch((error) => {
  console.error("ERRORE:", error.message ?? error);
  process.exit(1);
});
