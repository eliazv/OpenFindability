import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import { getAdmobRevenueRows } from "@/lib/insights";
import type { AppData } from "@/lib/types";

export const OF_SHEET_HEADERS = {
  OF_Projects: ["project_id", "slug", "name", "type", "website", "play_package", "app_store_id", "ga4_property", "updated_at"],
  OF_DailyMetrics: ["project_id", "slug", "source", "date", "visitors", "sessions", "pageviews", "key_events", "clicks", "impressions", "revenue", "currency", "grain"],
  OF_Revenue: ["project_id", "slug", "source", "date", "metric", "value", "currency", "grain"],
  OF_AppMetrics: ["project_id", "slug", "platform", "date", "metric", "value", "grain"],
  OF_Opportunities: ["project_id", "slug", "type", "severity", "score", "status", "title", "description", "query", "page", "clicks", "impressions", "ctr", "avg_position", "detected_at"],
  OF_SyncStatus: ["project_id", "slug", "source", "status", "finished_at", "latest_data_date"],
} as const;

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
    OF_Projects: [], OF_DailyMetrics: [], OF_Revenue: [], OF_AppMetrics: [], OF_Opportunities: [], OF_SyncStatus: [],
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
    // Apps Script is the sole owner of GSC rows in its own tabs.
    if (r.source === "gsc") continue;
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
    // Highest score first within each project, so the top of the tab is what to work on.
    if (tab === "OF_Opportunities") out[tab].sort((a, b) => String(a[1]).localeCompare(String(b[1])) || Number(b[4]) - Number(a[4]));
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
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(title,gridProperties))" });
  const titles = new Set((metadata.data.sheets ?? []).map((sheet) => sheet.properties?.title));
  const missing = (Object.keys(projection) as Tab[]).filter((tab) => !titles.has(tab));
  if (missing.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId, requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) },
    });
  }
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
