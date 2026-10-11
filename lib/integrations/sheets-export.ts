import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import { recentGscDetails } from "@/lib/gsc-detail";
import { getAdmobRevenueRows } from "@/lib/insights";
import type { AppData } from "@/lib/types";

export const OF_SHEET_HEADERS = {
  OF_Projects: ["project_id", "slug", "name", "type", "website", "play_package", "app_store_id", "ga4_property", "updated_at"],
  OF_DailyMetrics: ["project_id", "slug", "source", "date", "visitors", "sessions", "pageviews", "key_events", "clicks", "impressions", "revenue", "currency", "grain"],
  OF_Revenue: ["project_id", "slug", "source", "date", "metric", "value", "currency", "grain"],
  OF_AppMetrics: ["project_id", "slug", "platform", "date", "metric", "value", "grain"],
  OF_Opportunities: ["project_id", "slug", "type", "severity", "score", "status", "title", "description", "query", "page", "clicks", "impressions", "ctr", "avg_position", "detected_at"],
  OF_GscDaily: ["project_id", "slug", "date", "clicks", "impressions", "ctr", "avg_position"],
  OF_GscQueries: ["project_id", "slug", "query", "page", "clicks", "impressions", "ctr", "avg_position", "window_days", "window_end"],
  OF_GscPages: ["project_id", "slug", "page", "clicks", "impressions", "ctr", "avg_position", "window_days", "window_end"],
  OF_GscBreakdowns: ["project_id", "slug", "dimension", "key", "clicks", "impressions", "ctr", "avg_position", "range_start", "range_end"],
  OF_GscSitemaps: ["project_id", "slug", "path", "type", "last_submitted", "is_pending", "warnings", "errors"],
  OF_GscIndexSummary: ["site_url", "slug", "issue_code", "severity", "urls", "latest_inspection"],
  OF_GscIndexIssues: ["site_url", "slug", "url", "issue_code", "severity", "coverage_state", "last_crawl", "inspection_date"],
  OF_AdmobBreakdown: ["project_id", "slug", "date", "ad_source", "format", "ad_requests", "matched_requests", "match_rate", "impressions", "clicks", "estimated_earnings", "observed_ecpm", "currency"],
  OF_AsoKeywords: ["project_id", "slug", "date", "keyword", "country", "popularity", "difficulty", "opportunity", "app_rank", "classification"],
  OF_StoreCopy: ["project_id", "slug", "locale", "name", "subtitle", "keywords", "promotional_text", "version_state", "pulled_at"],
  OF_SyncStatus: ["project_id", "slug", "source", "status", "finished_at", "latest_data_date"],
} as const;

const GSC_WINDOW_DAYS = 28;
const GSC_TOP_QUERIES_PER_PROJECT = 500;
const GSC_TOP_PAGES_PER_PROJECT = 200;
// Tabs ranked "best first" within each project: column index of the ranking value.
const RANKED_TABS: Partial<Record<keyof typeof OF_SHEET_HEADERS, number>> = {
  OF_Opportunities: 4, OF_GscQueries: 5, OF_GscPages: 4, OF_AsoKeywords: 7,
};

// Keeps only the rows sharing the newest version within each group.
function latestPerGroup<T>(rows: T[], groupOf: (row: T) => string, versionOf: (row: T) => string): T[] {
  const newest = new Map<string, string>();
  for (const row of rows) {
    const group = groupOf(row);
    const version = versionOf(row);
    if (!newest.has(group) || version > newest.get(group)!) newest.set(group, version);
  }
  return rows.filter((row) => newest.get(groupOf(row)) === versionOf(row));
}

type Tab = keyof typeof OF_SHEET_HEADERS;
type Cell = string | number | boolean | null;
export type ExportProjection = Record<Tab, Cell[][]>;

type OpportunityEvidence = { query?: unknown; page?: unknown; clicks?: unknown; impressions?: unknown; ctr?: unknown; avgPosition?: unknown };

// Opportunities keep the whole source row in rawJson; only these whitelisted
// evidence fields reach the Sheet. Cannibalization carries one row per competing URL.
function opportunityEvidence(rawJson: unknown): Cell[] {
  const raw = (rawJson ?? {}) as OpportunityEvidence & { pages?: OpportunityEvidence[] };
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  if (Array.isArray(raw.pages)) {
    const clicks = raw.pages.reduce((sum, p) => sum + (num(p.clicks) ?? 0), 0);
    const impressions = raw.pages.reduce((sum, p) => sum + (num(p.impressions) ?? 0), 0);
    return [
      str(raw.query), raw.pages.map((p) => str(p.page)).filter(Boolean).join(" | "),
      clicks, impressions, impressions > 0 ? clicks / impressions : null, null,
    ];
  }
  return [str(raw.query), str(raw.page), num(raw.clicks), num(raw.impressions), num(raw.ctr), num(raw.avgPosition)];
}

function dateWithin(date: string, days: number, today: Date): boolean {
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return date >= cutoff.toISOString().slice(0, 10) && date <= today.toISOString().slice(0, 10);
}

export function buildSheetProjection(data: AppData, today = new Date(), days = 90): ExportProjection {
  const byId = new Map(data.projects.map((p) => [p.id, p]));
  const slug = (id: string) => byId.get(id)?.slug ?? "(deleted)";
  const out: ExportProjection = {
    OF_Projects: [], OF_DailyMetrics: [], OF_Revenue: [], OF_AppMetrics: [], OF_Opportunities: [],
    OF_GscDaily: [], OF_GscQueries: [], OF_GscPages: [], OF_GscBreakdowns: [], OF_GscSitemaps: [],
    OF_GscIndexSummary: [], OF_GscIndexIssues: [], OF_AdmobBreakdown: [], OF_AsoKeywords: [],
    OF_StoreCopy: [], OF_SyncStatus: [],
  };

  for (const p of data.projects) {
    out.OF_Projects.push([
      p.id, p.slug, p.name, p.type, p.websiteUrl ?? "",
      p.playConsolePackageName ?? "", p.appStoreTrackId ?? "",
      p.ga4PropertyId ?? "", p.updatedAt,
    ]);
  }
  for (const r of data.metricSnapshots) {
    if (!dateWithin(r.date, days, today) || !byId.has(r.projectId)) continue;
    // GSC never goes in OF_DailyMetrics: the Apps Script owns its own GSC tabs and
    // OpenFindability's copy lives in the dedicated OF_Gsc* tabs.
    if (r.source === "gsc") {
      out.OF_GscDaily.push([r.projectId, slug(r.projectId), r.date, r.clicks ?? 0, r.impressions ?? 0, r.ctr ?? null, r.avgPosition ?? null]);
      continue;
    }
    if (["ga4", "umami", "adsense"].includes(r.source)) {
      out.OF_DailyMetrics.push([
        r.projectId, slug(r.projectId), r.source, r.date,
        r.visitors ?? null,
        r.source === "ga4" ? (r.rawJson as { sessions?: number } | undefined)?.sessions ?? null : null,
        r.pageviews ?? null,
        r.source === "ga4" ? (r.rawJson as { keyEvents?: number } | undefined)?.keyEvents ?? null : null,
        r.clicks ?? null, r.impressions ?? null, r.revenue ?? null, r.currency ?? "", "daily",
      ]);
    }
    if (r.source === "revenuecat") {
      for (const [metric, value, grain] of [
        ["mrr", r.mrr, "snapshot"],
        ["subscribers", r.activeSubscribers, "snapshot"],
        ["rolling_28d_revenue", r.revenue, "rolling_28d"],
      ] as const) {
        if (value !== undefined) {
          out.OF_Revenue.push([r.projectId, slug(r.projectId), r.source, r.date, metric, value, r.currency ?? "", grain]);
        }
      }
    }
  }

  // Mediation is complete app-ad revenue; network is only a fallback. Never
  // sum both tables or mix unknown/multiple currencies in one amount.
  for (const r of getAdmobRevenueRows(data)) {
    if (byId.has(r.projectId) && dateWithin(r.date, days, today)) {
      out.OF_Revenue.push([r.projectId, slug(r.projectId), "admob", r.date, "estimated_revenue", r.revenue, r.currency ?? "", "daily"]);
    }
  }
  for (const r of data.playInstallStats) {
    if (!byId.has(r.projectId) || !dateWithin(r.date, days, today)) continue;
    for (const [metric, value, grain] of [
      ["device_installs", r.installs, "daily"],
      ["device_uninstalls", r.uninstalls, "daily"],
      ["active_device_installs", r.activeDeviceInstalls, "snapshot"],
    ] as const) {
      if (value !== undefined) out.OF_AppMetrics.push([r.projectId, slug(r.projectId), "android", r.date, metric, value, grain]);
    }
  }
  for (const r of data.ascAnalyticsMetrics) {
    if (!byId.has(r.projectId) || !dateWithin(r.date, days, today)) continue;
    if (r.downloads !== undefined) out.OF_AppMetrics.push([r.projectId, slug(r.projectId), "ios", r.date, "downloads", r.downloads, "daily"]);
  }
  for (const r of data.playVitalsMetrics) {
    if (!byId.has(r.projectId) || !dateWithin(r.date, days, today)) continue;
    if (r.crashRate !== undefined) out.OF_AppMetrics.push([r.projectId, slug(r.projectId), "android", r.date, "crash_rate", r.crashRate, "daily"]);
    if (r.anrRate !== undefined) out.OF_AppMetrics.push([r.projectId, slug(r.projectId), "android", r.date, "anr_rate", r.anrRate, "daily"]);
  }

  // Not date-windowed: an opportunity stays relevant until it is ignored or done.
  for (const o of data.opportunities) {
    if (!byId.has(o.projectId)) continue;
    out.OF_Opportunities.push([
      o.projectId, slug(o.projectId), o.type, o.severity, o.score, o.status,
      o.title, o.description, ...opportunityEvidence(o.rawJson), o.detectedAt,
    ]);
  }

  // Top queries/pages over the last 28 days of true daily rows (impression-weighted
  // position). These are Google's top rows, not an exhaustive query inventory.
  const gsc = recentGscDetails(data, GSC_WINDOW_DAYS);
  const topPerProject = <T extends { projectId: string; impressions: number }>(rows: T[], limit: number): T[] => {
    const seen = new Map<string, number>();
    return [...rows].sort((a, b) => b.impressions - a.impressions).filter((row) => {
      const count = seen.get(row.projectId) ?? 0;
      seen.set(row.projectId, count + 1);
      return byId.has(row.projectId) && count < limit;
    });
  };
  for (const q of topPerProject(gsc.queries, GSC_TOP_QUERIES_PER_PROJECT)) {
    out.OF_GscQueries.push([q.projectId, slug(q.projectId), q.query, q.page ?? "", q.clicks, q.impressions, q.ctr, q.avgPosition, GSC_WINDOW_DAYS, q.date]);
  }
  for (const p of topPerProject(gsc.pages, GSC_TOP_PAGES_PER_PROJECT)) {
    out.OF_GscPages.push([p.projectId, slug(p.projectId), p.page, p.clicks, p.impressions, p.ctr, p.avgPosition, GSC_WINDOW_DAYS, p.date]);
  }

  // Device/country/search-appearance splits are stored per synced range, not per day:
  // only the newest range of each project is exported.
  for (const b of latestPerGroup(data.gscDimensionBreakdowns, (row) => row.projectId, (row) => row.rangeEnd + row.rangeStart)) {
    if (!byId.has(b.projectId)) continue;
    out.OF_GscBreakdowns.push([b.projectId, slug(b.projectId), b.dimension, b.key, b.clicks, b.impressions, b.ctr, b.avgPosition, b.rangeStart, b.rangeEnd]);
  }
  for (const s of data.gscSitemaps) {
    if (!byId.has(s.projectId)) continue;
    out.OF_GscSitemaps.push([s.projectId, slug(s.projectId), s.path, s.type ?? "", s.lastSubmitted ?? "", s.isPending, s.warnings, s.errors]);
  }

  // Index audit: latest inspection per URL. Properties not mapped to a project have no
  // projectId, so these tabs are keyed by site_url. Indexed URLs only count in the summary.
  const inspections = latestPerGroup(data.gscIndexInspections, (row) => row.siteUrl + " " + row.url, (row) => row.inspectedAt);
  const indexSummary = new Map<string, { siteUrl: string; slug: string; code: string; severity: string; urls: number; latest: string }>();
  for (const i of inspections) {
    const siteSlug = i.projectId && byId.has(i.projectId) ? slug(i.projectId) : "";
    const key = i.siteUrl + " " + i.issueCode;
    const entry = indexSummary.get(key) ?? { siteUrl: i.siteUrl, slug: siteSlug, code: i.issueCode, severity: i.severity, urls: 0, latest: "" };
    entry.urls += 1;
    if (i.inspectionDate > entry.latest) entry.latest = i.inspectionDate;
    indexSummary.set(key, entry);
    if (i.issueCode !== "indexed") {
      out.OF_GscIndexIssues.push([i.siteUrl, siteSlug, i.url, i.issueCode, i.severity, i.coverageState ?? "", i.lastCrawlTime ?? "", i.inspectionDate]);
    }
  }
  for (const e of indexSummary.values()) out.OF_GscIndexSummary.push([e.siteUrl, e.slug, e.code, e.severity, e.urls, e.latest]);

  // Per ad network and format. These rows add up to the AdMob estimated_revenue in
  // OF_Revenue for the same day: they are its breakdown, not extra revenue.
  for (const m of data.admobMediationMetrics) {
    if (!byId.has(m.projectId) || !dateWithin(m.date, days, today)) continue;
    out.OF_AdmobBreakdown.push([
      m.projectId, slug(m.projectId), m.date, m.adSourceName, m.format ?? "",
      m.adRequests ?? null, m.matchedRequests ?? null, m.matchRate ?? null, m.impressions ?? null,
      m.clicks ?? null, m.estimatedEarnings ?? null, m.observedEcpm ?? null, m.currency ?? "",
    ]);
  }

  // appKeywords is append-only: export the newest research date of each project.
  for (const k of latestPerGroup(data.appKeywords, (row) => row.projectId, (row) => row.date)) {
    if (!byId.has(k.projectId)) continue;
    out.OF_AsoKeywords.push([
      k.projectId, slug(k.projectId), k.date, k.keyword, k.country, k.popularityScore,
      k.difficultyScore, k.opportunityScore, k.appRank ?? null, k.classification ?? "",
    ]);
  }

  // Newest App Store text per locale. Descriptions are left out: long, and not a ranking field.
  for (const c of latestPerGroup(data.ascMetadataSnapshots, (row) => row.projectId + " " + row.locale, (row) => row.createdAt)) {
    if (!byId.has(c.projectId)) continue;
    out.OF_StoreCopy.push([
      c.projectId, slug(c.projectId), c.locale, c.name ?? "", c.subtitle ?? "", c.keywords ?? "",
      c.promotionalText ?? "", c.versionState ?? "", c.createdAt,
    ]);
  }

  const latestRuns = new Map<string, (typeof data.connectorRuns)[number]>();
  for (const r of data.connectorRuns) {
    if (!r.projectId || !byId.has(r.projectId)) continue;
    const key = r.projectId + ":" + r.source;
    const previous = latestRuns.get(key);
    if (!previous || r.finishedAt > previous.finishedAt) latestRuns.set(key, r);
  }
  const latestDates = new Map<string, string>();
  const setDate = (projectId: string, source: string, date: string) => {
    const key = projectId + ":" + source;
    if (!latestDates.has(key) || date > latestDates.get(key)!) latestDates.set(key, date);
  };
  for (const r of data.metricSnapshots) setDate(r.projectId, r.source, r.date);
  for (const r of data.playInstallStats) setDate(r.projectId, "play_stats", r.date);
  for (const r of data.playVitalsMetrics) setDate(r.projectId, "play_vitals", r.date);
  for (const r of data.ascAnalyticsMetrics) setDate(r.projectId, "asc_analytics", r.date);

  for (const r of latestRuns.values()) {
    out.OF_SyncStatus.push([
      r.projectId!, slug(r.projectId!), r.source, r.status,
      r.finishedAt, latestDates.get(r.projectId! + ":" + r.source) ?? "",
    ]);
  }
  for (const tab of Object.keys(out) as Tab[]) {
    out[tab].sort((a, b) => a.map(String).join("|").localeCompare(b.map(String).join("|")));
    // Highest value first within each project, so the top of the tab is what to work on.
    const rank = RANKED_TABS[tab];
    if (rank !== undefined) out[tab].sort((a, b) => String(a[1]).localeCompare(String(b[1])) || Number(b[rank]) - Number(a[rank]));
    if (out[tab].length > 20000) throw new Error(`Sheet export for ${tab} exceeds safety limit (20k rows).`);
  }
  return out;
}

export async function exportGoogleSheet(data: AppData, spreadsheetId: string, days: number): Promise<ExportProjection> {
  if (!/^[\w-]{15,}$/.test(spreadsheetId)) throw new Error("Invalid GOOGLE_SHEET_ID.");
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!json && !file) throw new Error("Configure a Google service account with editor access to the target private Sheet.");
  const credentials = JSON.parse(json || await readFile(file as string, "utf8"));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth });
  const projection = buildSheetProjection(data, new Date(), days);
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,gridProperties))" });
  const titles = new Set((metadata.data.sheets ?? []).map((sheet) => sheet.properties?.title));
  const missing = (Object.keys(projection) as Tab[]).filter((tab) => !titles.has(tab));
  if (missing.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId, requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) },
    });
  }
  // values.batchUpdate rejects a range beyond the tab's grid, and new tabs start
  // at 1000 rows, so grow any tab that is too short before writing.
  const grids = missing.length
    ? (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,gridProperties))" })).data.sheets ?? []
    : metadata.data.sheets ?? [];
  const growRequests = (Object.keys(projection) as Tab[]).flatMap((tab) => {
    const properties = grids.find((sheet) => sheet.properties?.title === tab)?.properties;
    const shortBy = projection[tab].length + 1 - (properties?.gridProperties?.rowCount ?? 0);
    return properties?.sheetId != null && shortBy > 0
      ? [{ appendDimension: { sheetId: properties.sheetId, dimension: "ROWS", length: shortBy } }]
      : [];
  });
  if (growRequests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: growRequests } });
  // A single values.batchUpdate applies the desired rows. The exporter owns
  // ONLY OF_ tabs: GSC Apps Script tabs stay untouched.
  const dataToWrite = (Object.keys(projection) as Tab[]).map((tab) => ({
    range: `'${tab}'!A1:${String.fromCharCode(64 + OF_SHEET_HEADERS[tab].length)}${projection[tab].length + 1}`,
    values: [[...OF_SHEET_HEADERS[tab]], ...projection[tab].map((row) => row.map((v) => v ?? ""))],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId, requestBody: { valueInputOption: "RAW", data: dataToWrite },
  });
  // Remove stale tail values if a project was deleted, leaving column styles.
  for (const tab of Object.keys(projection) as Tab[]) {
    const old = (metadata.data.sheets ?? []).find((s) => s.properties?.title === tab)?.properties?.gridProperties?.rowCount ?? 0;
    const newEnd = projection[tab].length + 1;
    if (old > newEnd) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId, range: `'${tab}'!A${newEnd + 1}:${String.fromCharCode(64 + OF_SHEET_HEADERS[tab].length)}${old}`, requestBody: {},
      });
    }
  }
  return projection;
}
