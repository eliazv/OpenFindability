import type { searchconsole_v1 } from "googleapis";

import { createGscClient, listGscSites } from "@/lib/connectors/gsc";
import { daysAgo, nowIso } from "@/lib/dates";
import { createId } from "@/lib/id";
import { readData, writeData } from "@/lib/store";
import type {
  AppData,
  ConnectorRun,
  GscIndexInspection,
  GscIndexIssueCode,
  Project,
} from "@/lib/types";

const DEFAULT_MAX_URLS_PER_SITE = 2_000;
const MAX_DISCOVERED_URLS_PER_SITE = 250_000;
const MAX_SITEMAP_FILES_PER_SITE = 2_000;
const INSPECTION_CONCURRENCY = 16;
const CHECKPOINT_EVERY = 500;

type UrlCandidate = {
  url: string;
  discoveredFrom: Set<string>;
};

export type GscIndexAuditOptions = {
  maxUrlsPerSite?: number;
  siteFilter?: string;
  onProgress?: (message: string) => void;
};

export type GscIndexAuditSiteResult = {
  siteUrl: string;
  projectId?: string;
  discovered: number;
  inspected: number;
  indexed: number;
  problems: number;
  failed: number;
  skippedToday: number;
  discoveryWarnings: string[];
};

export async function auditGscIndex(options: GscIndexAuditOptions = {}): Promise<GscIndexAuditSiteResult[]> {
  const maxUrlsPerSite = normalizeLimit(options.maxUrlsPerSite);
  const progress = options.onProgress ?? (() => undefined);
  const data = await readData();
  const sites = (await listGscSites())
    .filter((site) => site.siteUrl)
    .filter((site) => matchesSiteFilter(site.siteUrl, options.siteFilter, data.projects));

  if (sites.length === 0) {
    throw new Error(options.siteFilter ? `No GSC property matches "${options.siteFilter}".` : "No GSC properties found.");
  }

  const searchconsole = await createGscClient();
  const results: GscIndexAuditSiteResult[] = [];

  for (const [siteIndex, site] of sites.entries()) {
    const siteUrl = site.siteUrl;
    const project = data.projects.find((item) => item.gscProperty === siteUrl);
    progress(`[${siteIndex + 1}/${sites.length}] Discovering URLs for ${siteUrl}...`);
    const startedAt = nowIso();

    try {
      const discovery = await discoverUrls(searchconsole, siteUrl, project, data);
      const today = startedAt.slice(0, 10);
      const inspectedToday = new Set(
        data.gscIndexInspections
          .filter((row) => row.siteUrl === siteUrl && row.inspectionDate === today)
          .map((row) => row.url),
      );
      const candidates = prioritizeCandidates(discovery.candidates, data.gscIndexInspections, siteUrl)
        .filter((candidate) => !inspectedToday.has(candidate.url));
      const remainingQuota = Math.max(0, maxUrlsPerSite - inspectedToday.size);
      const selected = candidates.slice(0, remainingQuota);

      progress(
        `[${siteIndex + 1}/${sites.length}] ${siteUrl}: ${discovery.candidates.length} URL found, ` +
          `${selected.length} to inspect (${inspectedToday.size} already inspected today).`,
      );

      let completed = 0;
      let quotaStopped = false;
      const incoming: GscIndexInspection[] = [];

      for (let offset = 0; offset < selected.length && !quotaStopped; offset += INSPECTION_CONCURRENCY) {
        const batch = selected.slice(offset, offset + INSPECTION_CONCURRENCY);
        const inspected = await Promise.all(
          batch.map((candidate) => inspectUrl(searchconsole, siteUrl, project?.id, candidate)),
        );
        const rows = inspected.flatMap((result) => result.rows);
        incoming.push(...rows);
        completed += rows.length;
        quotaStopped = inspected.some((result) => result.quotaExceeded);

        if (completed >= CHECKPOINT_EVERY && completed % CHECKPOINT_EVERY < INSPECTION_CONCURRENCY) {
          data.gscIndexInspections = upsertDailyInspections(data.gscIndexInspections, incoming);
          await writeData(data);
        }

        if (completed % 100 === 0 || completed === selected.length || quotaStopped) {
          progress(`[${siteIndex + 1}/${sites.length}] ${siteUrl}: inspected ${completed}/${selected.length}.`);
        }
      }

      data.gscIndexInspections = upsertDailyInspections(data.gscIndexInspections, incoming);
      const indexed = incoming.filter((row) => row.issueCode === "indexed").length;
      const failed = incoming.filter((row) => row.issueCode === "inspection_error").length;
      const problems = incoming.length - indexed - failed;
      const result: GscIndexAuditSiteResult = {
        siteUrl,
        projectId: project?.id,
        discovered: discovery.candidates.length,
        inspected: incoming.length,
        indexed,
        problems,
        failed,
        skippedToday: inspectedToday.size,
        discoveryWarnings: discovery.warnings,
      };
      results.push(result);
      data.connectorRuns.push(
        makeRun(project?.id, startedAt, failed === incoming.length && incoming.length > 0 ? "failed" : "success", {
          ...result,
          quotaStopped,
        }),
      );
      await writeData(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      progress(`[${siteIndex + 1}/${sites.length}] ${siteUrl}: failed: ${message}`);
      const result: GscIndexAuditSiteResult = {
        siteUrl,
        projectId: project?.id,
        discovered: 0,
        inspected: 0,
        indexed: 0,
        problems: 0,
        failed: 1,
        skippedToday: 0,
        discoveryWarnings: [message],
      };
      results.push(result);
      data.connectorRuns.push(makeRun(project?.id, startedAt, "failed", result, message));
      await writeData(data);
    }
  }

  return results;
}

async function discoverUrls(
  searchconsole: searchconsole_v1.Searchconsole,
  siteUrl: string,
  project: Project | undefined,
  data: AppData,
): Promise<{ candidates: UrlCandidate[]; warnings: string[] }> {
  const candidates = new Map<string, UrlCandidate>();
  const warnings: string[] = [];
  const add = (url: string, source: string) => {
    const normalized = normalizeUrl(url);
    if (!normalized || !belongsToProperty(normalized, siteUrl)) return;
    const existing = candidates.get(normalized) ?? { url: normalized, discoveredFrom: new Set<string>() };
    existing.discoveredFrom.add(source);
    candidates.set(normalized, existing);
  };

  const previousRows = data.gscIndexInspections.filter((row) => row.siteUrl === siteUrl);
  for (const row of previousRows) add(row.url, "previous_audit");

  if (project) {
    for (const row of data.pageMetrics.filter((item) => item.projectId === project.id)) add(row.page, "stored_gsc_page");
    for (const row of data.searchQueries.filter((item) => item.projectId === project.id && item.page)) {
      add(row.page as string, "stored_gsc_query_page");
    }
  }

  try {
    const response = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: daysAgo(90),
        endDate: daysAgo(2),
        dimensions: ["page"],
        rowLimit: 25_000,
        startRow: 0,
      },
    });
    for (const row of response.data.rows ?? []) add(row.keys?.[0] ?? "", "search_analytics");
  } catch (error) {
    warnings.push(`Search Analytics URL discovery failed: ${errorMessage(error)}`);
  }

  let sitemapPaths: string[] = [];
  try {
    const response = await searchconsole.sitemaps.list({ siteUrl });
    sitemapPaths = (response.data.sitemap ?? []).map((item) => item.path ?? "").filter(Boolean);
  } catch (error) {
    warnings.push(`Sitemap list failed: ${errorMessage(error)}`);
  }

  const sitemapResult = await discoverFromSitemaps(sitemapPaths, add);
  warnings.push(...sitemapResult.warnings);
  add(propertyRootUrl(siteUrl), "property_root");

  return {
    candidates: [...candidates.values()].slice(0, MAX_DISCOVERED_URLS_PER_SITE),
    warnings,
  };
}

async function discoverFromSitemaps(
  initialPaths: string[],
  add: (url: string, source: string) => void,
): Promise<{ warnings: string[] }> {
  const queue = [...new Set(initialPaths)];
  const visited = new Set<string>();
  const warnings: string[] = [];

  while (queue.length > 0 && visited.size < MAX_SITEMAP_FILES_PER_SITE) {
    const sitemapUrl = queue.shift() as string;
    if (visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);

    try {
      const response = await fetch(sitemapUrl, {
        headers: { "user-agent": "OpenFindability/0.1 sitemap-audit" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        warnings.push(`${sitemapUrl}: HTTP ${response.status}`);
        continue;
      }
      const xml = await response.text();
      const locations = extractLocations(xml);
      if (/<\s*sitemapindex[\s>]/i.test(xml)) {
        for (const location of locations) {
          if (!visited.has(location)) queue.push(location);
        }
      } else {
        for (const location of locations) add(location, `sitemap:${sitemapUrl}`);
      }
    } catch (error) {
      warnings.push(`${sitemapUrl}: ${errorMessage(error)}`);
    }
  }

  if (queue.length > 0) warnings.push(`Sitemap discovery stopped after ${MAX_SITEMAP_FILES_PER_SITE} files.`);
  return { warnings };
}

function extractLocations(xml: string): string[] {
  const locations: string[] = [];
  const pattern = /<\s*loc(?:\s[^>]*)?>([\s\S]*?)<\s*\/\s*loc\s*>/gi;
  for (const match of xml.matchAll(pattern)) {
    const value = decodeXmlEntities(match[1].trim());
    if (value) locations.push(value);
  }
  return locations;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

async function inspectUrl(
  searchconsole: searchconsole_v1.Searchconsole,
  siteUrl: string,
  projectId: string | undefined,
  candidate: UrlCandidate,
): Promise<{ rows: GscIndexInspection[]; quotaExceeded: boolean }> {
  const inspectedAt = nowIso();
  try {
    const response = await searchconsole.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl: candidate.url,
        siteUrl,
        languageCode: "en-US",
      },
    });
    const inspection = response.data.inspectionResult;
    const status = inspection?.indexStatusResult;
    const issue = classifyIssue(status);
    return {
      rows: [
        {
          id: createId("gscidx"),
          projectId,
          siteUrl,
          url: candidate.url,
          inspectionDate: inspectedAt.slice(0, 10),
          inspectedAt,
          discoveredFrom: [...candidate.discoveredFrom],
          verdict: status?.verdict ?? undefined,
          coverageState: status?.coverageState ?? undefined,
          robotsTxtState: status?.robotsTxtState ?? undefined,
          indexingState: status?.indexingState ?? undefined,
          pageFetchState: status?.pageFetchState ?? undefined,
          googleCanonical: status?.googleCanonical ?? undefined,
          userCanonical: status?.userCanonical ?? undefined,
          lastCrawlTime: status?.lastCrawlTime ?? undefined,
          crawledAs: status?.crawledAs ?? undefined,
          inspectionResultLink: inspection?.inspectionResultLink ?? undefined,
          issueCode: issue.code,
          severity: issue.severity,
          rawJson: response.data,
        },
      ],
      quotaExceeded: false,
    };
  } catch (error) {
    const quotaExceeded = isQuotaError(error);
    return {
      rows: quotaExceeded
        ? []
        : [
            {
              id: createId("gscidx"),
              projectId,
              siteUrl,
              url: candidate.url,
              inspectionDate: inspectedAt.slice(0, 10),
              inspectedAt,
              discoveredFrom: [...candidate.discoveredFrom],
              issueCode: "inspection_error",
              severity: "high",
              rawJson: { error: errorMessage(error) },
            },
          ],
      quotaExceeded,
    };
  }
}

export function classifyIssue(
  status: searchconsole_v1.Schema$IndexStatusInspectionResult | null | undefined,
): { code: GscIndexIssueCode; severity: GscIndexInspection["severity"] } {
  if (!status) return { code: "inspection_error", severity: "high" };
  const fetchState = (status.pageFetchState ?? "").toUpperCase();
  const indexingState = (status.indexingState ?? "").toUpperCase();
  const robotsState = (status.robotsTxtState ?? "").toUpperCase();
  const coverage = (status.coverageState ?? "").toLowerCase();

  if (robotsState === "DISALLOWED" || fetchState === "BLOCKED_ROBOTS_TXT") {
    return { code: "blocked_by_robots", severity: "high" };
  }
  if (indexingState === "BLOCKED_BY_META_TAG" || indexingState === "BLOCKED_BY_HTTP_HEADER") {
    return { code: "blocked_by_noindex", severity: "high" };
  }
  if (fetchState === "NOT_FOUND") return { code: "not_found", severity: "high" };
  if (fetchState === "SOFT_404") return { code: "soft_404", severity: "high" };
  if (fetchState === "SERVER_ERROR" || fetchState === "INTERNAL_CRAWL_ERROR") {
    return { code: "server_error", severity: "high" };
  }
  if (["ACCESS_DENIED", "ACCESS_FORBIDDEN", "BLOCKED_4XX"].includes(fetchState)) {
    return { code: "access_denied", severity: "high" };
  }
  if (fetchState === "REDIRECT_ERROR") return { code: "redirect_error", severity: "high" };
  if (coverage.includes("crawled") && coverage.includes("not indexed")) {
    return { code: "crawled_not_indexed", severity: "medium" };
  }
  if (coverage.includes("discovered") && coverage.includes("not indexed")) {
    return { code: "discovered_not_indexed", severity: "medium" };
  }
  if (coverage.includes("duplicate") || coverage.includes("canonical")) {
    return { code: "duplicate_canonical", severity: "medium" };
  }
  if (coverage.includes("redirect")) return { code: "redirected", severity: "low" };
  if ((status.verdict ?? "").toUpperCase() === "PASS") return { code: "indexed", severity: "none" };
  return { code: "not_indexed", severity: "medium" };
}

function prioritizeCandidates(
  candidates: UrlCandidate[],
  inspections: GscIndexInspection[],
  siteUrl: string,
): UrlCandidate[] {
  const latest = new Map<string, GscIndexInspection>();
  for (const row of inspections.filter((item) => item.siteUrl === siteUrl)) {
    const current = latest.get(row.url);
    if (!current || row.inspectedAt > current.inspectedAt) latest.set(row.url, row);
  }

  return [...candidates].sort((a, b) => {
    const aPrevious = latest.get(a.url);
    const bPrevious = latest.get(b.url);
    const aPriority = aPrevious ? (aPrevious.severity === "high" ? 1 : aPrevious.severity === "medium" ? 2 : 3) : 0;
    const bPriority = bPrevious ? (bPrevious.severity === "high" ? 1 : bPrevious.severity === "medium" ? 2 : 3) : 0;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (aPrevious?.inspectedAt ?? "").localeCompare(bPrevious?.inspectedAt ?? "") || a.url.localeCompare(b.url);
  });
}

function upsertDailyInspections(
  existing: GscIndexInspection[],
  incoming: GscIndexInspection[],
): GscIndexInspection[] {
  const keys = new Set(incoming.map((row) => `${row.siteUrl}::${row.inspectionDate}::${row.url}`));
  return [
    ...existing.filter((row) => !keys.has(`${row.siteUrl}::${row.inspectionDate}::${row.url}`)),
    ...incoming,
  ];
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_URLS_PER_SITE;
  if (!Number.isInteger(value) || value < 1 || value > DEFAULT_MAX_URLS_PER_SITE) {
    throw new Error(`maxUrlsPerSite must be an integer between 1 and ${DEFAULT_MAX_URLS_PER_SITE}.`);
  }
  return value;
}

function matchesSiteFilter(siteUrl: string, filter: string | undefined, projects: Project[]): boolean {
  if (!filter) return true;
  const normalized = filter.toLowerCase();
  const project = projects.find((item) => item.slug.toLowerCase() === normalized);
  return project ? project.gscProperty === siteUrl : siteUrl.toLowerCase().includes(normalized);
}

function normalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function belongsToProperty(urlValue: string, siteUrl: string): boolean {
  const url = new URL(urlValue);
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    return url.hostname.toLowerCase() === domain || url.hostname.toLowerCase().endsWith(`.${domain}`);
  }
  try {
    return urlValue.startsWith(new URL(siteUrl).toString());
  } catch {
    return false;
  }
}

function propertyRootUrl(siteUrl: string): string {
  return siteUrl.startsWith("sc-domain:") ? `https://${siteUrl.slice("sc-domain:".length)}/` : siteUrl;
}

function makeRun(
  projectId: string | undefined,
  startedAt: string,
  status: ConnectorRun["status"],
  stats: Record<string, unknown>,
  errorMessageValue?: string,
): ConnectorRun {
  return {
    id: createId("run"),
    source: "gsc_index",
    projectId,
    status,
    startedAt,
    finishedAt: nowIso(),
    errorMessage: errorMessageValue,
    stats,
  };
}

function isQuotaError(error: unknown): boolean {
  const value = error as { code?: number; response?: { status?: number }; message?: string };
  return (
    value.code === 429 ||
    value.response?.status === 429 ||
    /quota|rate limit|daily limit/i.test(value.message ?? "")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getIndexIssueRecommendation(code: GscIndexIssueCode): string {
  const recommendations: Record<GscIndexIssueCode, string> = {
    indexed: "Nessuna azione richiesta.",
    blocked_by_robots: "Verifica robots.txt e consenti Googlebot se la pagina deve essere indicizzata.",
    blocked_by_noindex: "Rimuovi meta robots noindex o X-Robots-Tag se l'esclusione non e intenzionale.",
    not_found: "Ripristina la pagina, crea un redirect 301 pertinente oppure rimuovila da link e sitemap.",
    soft_404: "Aggiungi contenuto utile oppure restituisci un vero 404/410 se la pagina non deve esistere.",
    server_error: "Correggi errori 5xx, timeout e instabilita del server.",
    access_denied: "Rimuovi blocchi 401/403/WAF che impediscono l'accesso a Googlebot.",
    redirect_error: "Correggi loop, catene e destinazioni di redirect non raggiungibili.",
    crawled_not_indexed: "Migliora unicita, contenuto, linking interno e segnali canonical; evita pagine sottili.",
    discovered_not_indexed: "Rafforza linking interno e qualita, riduci URL inutili e verifica capacita di crawling.",
    duplicate_canonical: "Controlla canonical, redirect e linking interno; conferma se la scelta di Google e corretta.",
    redirected: "Verifica che il redirect sia intenzionale e rimuovi l'URL di origine dalla sitemap.",
    not_indexed: "Apri il dettaglio URL Inspection e verifica copertura, canonical e segnali di qualita.",
    inspection_error: "Ripeti l'ispezione e verifica permessi, proprieta URL e quota API.",
  };
  return recommendations[code];
}
