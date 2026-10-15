import type Database from "better-sqlite3";
import type { DuckDBConnection } from "@duckdb/node-api";
import { CONNECTOR_CATALOG } from "@/lib/connectors/catalog";
import { createGrowthWarehouseViews } from "./growth-warehouse";

const q = (s: string) => `"${s.replaceAll('"', '""')}"`;

export async function publishSourceConfiguration(c: DuckDBConnection, sqlite: Database.Database, database: string) {
  const target = `${q(database)}.main.project_source_configuration`;
  await c.run(`CREATE TABLE IF NOT EXISTS ${target} (project_id VARCHAR, source VARCHAR, configured BOOLEAN, typical_lag_days INTEGER, stale_after_days INTEGER, PRIMARY KEY(project_id,source))`);
  const fields = {
    ga4_landing: "ga4_property_id",
    gsc: "gsc_property", ga4: "ga4_property_id", umami: "umami_website_id", bing_webmaster: "bing_site_url", cloudflare_ai: "cloudflare_zone_id", clarity: "clarity_token_env",
    play_console: "play_console_package_name", play_vitals: "play_console_package_name", play_stats: "play_console_package_name", asc_analytics: "app_store_track_id", revenuecat: "revenue_cat_project_id", adsense: "adsense_site_domain", aso: "aso_keywords",
  } as const;
  // Export booleans only; token/key values and private project fields never leave SQLite.
  const activeWeb="NULLIF(website_url,'') IS NOT NULL AND (NULLIF(gsc_property,'') IS NOT NULL OR NULLIF(ga4_property_id,'') IS NOT NULL OR NULLIF(umami_website_id,'') IS NOT NULL)";
  const configured = sqlite.prepare(`SELECT id, (${activeWeb}) AS pagespeed, (${activeWeb} AND ${process.env.CRUX_API_KEY?1:0}) AS crux,
    ${Object.entries(fields).map(([source, field]) => `${source === "aso" ? "json_valid(aso_keywords) AND json_array_length(aso_keywords)>0" : source === "ga4_landing" ? "NULLIF(ga4_property_id,'') IS NOT NULL AND NULLIF(website_url,'') IS NOT NULL" : `NULLIF(${q(field)},'') IS NOT NULL`} AS ${q(source)}`).join(",")},
    (NULLIF(admob_app_id,'') IS NOT NULL OR NULLIF(admob_app_id_ios,'') IS NOT NULL) AS admob FROM projects`).all() as Record<string, string | number>[];
  await c.run("BEGIN TRANSACTION");
  try {
    await c.run(`DELETE FROM ${target}`);
    const rows = configured.flatMap(project => Object.entries(CONNECTOR_CATALOG).map(([source, descriptor]) => [String(project.id), source, Boolean(project[source]), descriptor.typicalLagDays, descriptor.staleAfterDays]));
    for (let offset=0;offset<rows.length;offset+=100) {
      const batch = rows.slice(offset,offset+100);
      const values = batch.flat();
      await c.run(`INSERT INTO ${target} VALUES ${batch.map((_,i) => `(${[1,2,3,4,5].map(j=>`$${i*5+j}`).join(",")})`).join(",")}`, values);
    }
    await c.run("COMMIT");
  } catch (error) { await c.run("ROLLBACK"); throw error; }
}

export async function createSemanticViews(c: DuckDBConnection, database: string) {
  const d = `${q(database)}.main`;
  await c.run(`CREATE OR REPLACE VIEW ${d}.app_store_daily_quality AS SELECT *,
    CASE WHEN date < '2025-09-21' THEN NULL ELSE downloads END AS trusted_downloads,
    date >= '2025-09-21' AND downloads IS NOT NULL AS downloads_reliable,
    CASE WHEN date < '2025-09-21' THEN 'legacy_inflated' WHEN downloads IS NULL THEN 'missing' ELSE 'available' END AS downloads_status,
    retention_day1 IS NOT NULL AS retention_d1_available, retention_day7 IS NOT NULL AS retention_d7_available, retention_day28 IS NOT NULL AS retention_d28_available
    FROM ${d}.asc_analytics_metrics`);
  // Long format deliberately keeps source, unit, currency and grain in the key.
  // A wide row would tempt consumers to sum USD rolling revenue with EUR daily ads.
  await c.run(`CREATE OR REPLACE VIEW ${d}.project_daily_kpis AS
    SELECT m.project_id,p.slug,m.source,m.date,v.metric,v.value,v.unit,CAST(NULL AS VARCHAR) currency,'day' grain
    FROM ${d}.metric_snapshots m JOIN ${d}.projects p ON p.id=m.project_id,
    LATERAL (VALUES ('clicks',m.clicks::DOUBLE,'count'),('impressions',m.impressions::DOUBLE,'count'),
      (CASE WHEN m.source='ga4' THEN 'daily_active_users' ELSE 'daily_visitors' END,m.visitors::DOUBLE,'count'),('pageviews',m.pageviews::DOUBLE,'count'),('sessions',m.sessions::DOUBLE,'count'),('key_events',m.key_events::DOUBLE,'count')) v(metric,value,unit)
    WHERE m.source IN ('gsc','bing_webmaster','ga4','umami') AND v.value IS NOT NULL
    UNION ALL SELECT a.project_id,p.slug,a.source,a.date,'ad_revenue',a.revenue,'currency',a.currency,'day' FROM ${d}.daily_ad_revenue a JOIN ${d}.projects p ON p.id=a.project_id WHERE a.revenue IS NOT NULL
    UNION ALL SELECT a.project_id,p.slug,'asc_analytics',a.date,'first_time_downloads',a.trusted_downloads::DOUBLE,'count',NULL,'day' FROM ${d}.app_store_daily_quality a JOIN ${d}.projects p ON p.id=a.project_id WHERE a.trusted_downloads IS NOT NULL
    UNION ALL SELECT a.project_id,p.slug,'play_stats',a.date,v.metric,v.value,'count',NULL,'day' FROM ${d}.play_install_stats a JOIN ${d}.projects p ON p.id=a.project_id,
      LATERAL (VALUES ('installs',a.installs::DOUBLE),('uninstalls',a.uninstalls::DOUBLE),('user_installs',a.user_installs::DOUBLE),('user_uninstalls',a.user_uninstalls::DOUBLE),('install_events',a.install_events::DOUBLE),('uninstall_events',a.uninstall_events::DOUBLE)) v(metric,value) WHERE v.value IS NOT NULL`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.project_latest_kpis AS
    SELECT * FROM ${d}.project_daily_kpis QUALIFY row_number() OVER(PARTITION BY project_id,source,metric,currency ORDER BY date DESC)=1
    UNION ALL SELECT r.project_id,p.slug,'revenuecat',r.date,v.metric,v.value,v.unit,CASE WHEN v.unit='currency' THEN r.currency ELSE NULL END,v.grain
      FROM ${d}.revenuecat_latest r JOIN ${d}.projects p ON p.id=r.project_id,
      LATERAL (VALUES ('rolling_28d_revenue',r.revenue::DOUBLE,'currency','rolling_28d'),('mrr',r.mrr::DOUBLE,'currency','snapshot'),
      ('active_subscribers',r.active_subscribers::DOUBLE,'count','snapshot'),('active_trials',r.active_trials::DOUBLE,'count','snapshot')) v(metric,value,unit,grain) WHERE v.value IS NOT NULL`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.source_coverage AS WITH observations AS (
    SELECT project_id,source,min(date) first_date,max(date) last_date,count(DISTINCT date) days_with_rows,count(*) stored_rows FROM ${d}.metric_snapshots GROUP BY project_id,source
    UNION ALL SELECT project_id,'play_stats',min(date),max(date),count(DISTINCT date),count(*) FROM ${d}.play_install_stats GROUP BY project_id
    UNION ALL SELECT project_id,'play_vitals',min(date),max(date),count(DISTINCT date),count(*) FROM ${d}.play_vitals_metrics GROUP BY project_id
    UNION ALL SELECT project_id,'asc_analytics',min(date),max(date),count(DISTINCT date),count(*) FROM ${d}.asc_analytics_metrics GROUP BY project_id
    UNION ALL SELECT project_id,source,min(substr(window_start,1,10)),max(substr(window_end,1,10)),count(DISTINCT substr(window_start,1,10)),count(*) FROM ${d}.seo_geo_observations WHERE source IN ('clarity','cloudflare_ai') GROUP BY project_id,source
    UNION ALL SELECT project_id,'aso',min(date),max(date),count(DISTINCT date),count(*) FROM ${d}.app_keywords GROUP BY project_id
    UNION ALL SELECT project_id,'ga4_landing',min(date),max(date),count(DISTINCT date),count(*) FROM ${d}.ga4_landing_metrics GROUP BY project_id
    UNION ALL SELECT project_id,source,min(date),max(date),count(DISTINCT date),count(*) FROM ${d}.web_performance_metrics GROUP BY project_id,source
    ), totals AS (SELECT project_id,source,min(first_date) first_date,max(last_date) last_date,max(days_with_rows) days_with_rows,sum(stored_rows) stored_rows FROM observations GROUP BY project_id,source)
    SELECT cfg.*,p.slug,t.first_date,t.last_date,coalesce(t.days_with_rows,0) days_with_rows,coalesce(t.stored_rows,0) stored_rows,
      CASE WHEN cfg.source IN ('clarity','cloudflare_ai') THEN 'windowed; days are not proof of continuous coverage'
      WHEN cfg.source='revenuecat' THEN 'snapshot; missing days cannot be backfilled' ELSE 'dates with stored rows; missing dates are unknown' END coverage_note
    FROM ${d}.project_source_configuration cfg JOIN ${d}.projects p ON p.id=cfg.project_id LEFT JOIN totals t ON t.project_id=cfg.project_id AND t.source=cfg.source`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.data_freshness AS WITH latest AS (
    SELECT * FROM ${d}.connector_runs WHERE project_id IS NOT NULL QUALIFY row_number() OVER(PARTITION BY project_id,source ORDER BY finished_at DESC,id DESC)=1)
    SELECT cov.*,r.status latest_sync_status,r.started_at latest_sync_started_at,r.finished_at latest_sync_finished_at,
      CASE WHEN NOT cov.configured THEN 'not_configured' WHEN r.id IS NULL THEN 'never_synced'
      WHEN r.status IN ('failed','partial','no_data','skipped') THEN r.status
      WHEN date_diff('hour',try_cast(r.finished_at AS TIMESTAMPTZ),current_timestamp)>cov.stale_after_days*24 THEN 'stale'
      WHEN cov.stored_rows=0 THEN 'no_stored_metrics' ELSE 'fresh' END freshness_status
    FROM ${d}.source_coverage cov LEFT JOIN latest r ON r.project_id=cov.project_id AND r.source=cov.source`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.warehouse_integrity AS
    SELECT 'unmapped_index_inspections' AS check_name,count(*) AS issue_count FROM ${d}.gsc_index_inspections WHERE project_id IS NULL
    UNION ALL SELECT 'dangling_index_project',count(*) FROM ${d}.gsc_index_inspections i LEFT JOIN ${d}.projects p ON p.id=i.project_id WHERE i.project_id IS NOT NULL AND p.id IS NULL
    UNION ALL SELECT 'legacy_untrusted_ios_download_rows',count(*) FROM ${d}.asc_analytics_metrics WHERE date<'2025-09-21'`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.gsc_page_monthly AS SELECT project_id,page,substr(date,1,7) AS report_month,min(date) first_date,max(date) last_date,count(DISTINCT date) days_with_rows,
    sum(clicks) clicks,sum(impressions) impressions,sum(clicks)::DOUBLE/nullif(sum(impressions),0) ctr,sum(avg_position*impressions)/nullif(sum(impressions),0) avg_position
    FROM ${d}.page_metrics GROUP BY project_id,page,substr(date,1,7)`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.gsc_query_monthly AS SELECT project_id,query,page,substr(date,1,7) AS report_month,min(date) first_date,max(date) last_date,count(DISTINCT date) days_with_rows,
    sum(clicks) clicks,sum(impressions) impressions,sum(clicks)::DOUBLE/nullif(sum(impressions),0) ctr,sum(avg_position*impressions)/nullif(sum(impressions),0) avg_position
    FROM ${d}.search_queries GROUP BY project_id,query,page,substr(date,1,7)`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.index_audit_latest AS SELECT *,date_diff('day',try_cast(inspection_date AS DATE),current_date) audit_age_days
    FROM ${d}.gsc_index_inspections QUALIFY row_number() OVER(PARTITION BY site_url,url ORDER BY inspection_date DESC,inspected_at DESC,id DESC)=1`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.ai_crawler_daily AS SELECT project_id,substr(window_start,1,10) date,crawler,host,http_status,
    sum(requests) requests,count(DISTINCT window_start) observed_hours,max(fetched_at) fetched_at,
    'sampled proxy requests; observed hours are not proof of full-day coverage or citations' coverage_note
    FROM ${d}.ai_crawler_requests GROUP BY project_id,substr(window_start,1,10),crawler,host,http_status`);
  await createGrowthWarehouseViews(c,d);
  await c.run(`CREATE OR REPLACE VIEW ${d}.play_install_quality AS SELECT *,
    uninstalls=0 AND (coalesce(user_uninstalls,0)>0 OR coalesce(uninstall_events,0)>0) AS device_zero_with_uninstall_activity,
    'installs/uninstalls are device series; user counts and event counts are separate, never fallbacks or a combined total' AS interpretation
    FROM ${d}.play_install_stats`);
  await c.run(`INSERT OR REPLACE INTO ${d}.metric_dictionary VALUES ('play_install_quality','Device, user and event uninstall counts are distinct CSV columns. A zero device count does not establish absence of user uninstalls or uninstall events. Do not replace device zeros with another metric, sum these series together, or infer retention from them. Missing columns stay NULL.')`);
}

const COMMENTS: Record<string, string> = {
  user_installs:"Play CSV Daily User Installs. Distinct from Daily Device Installs and Install events; never add these series or treat them as fallbacks.",
  user_uninstalls:"Play CSV Daily User Uninstalls. Can be positive when device uninstalls are zero. Not a cohort retention or churn rate.",
  install_events:"Play CSV Install events, if supplied. Event count, not distinct devices or users.",
  uninstall_events:"Play CSV Uninstall events, if supplied. Event count; can differ from user/device counts. Missing is unknown.",
  uninstalls:"Play Daily Device Uninstalls only. Inspect play_install_quality.user_uninstalls and uninstall_events independently before interpreting zeros.",
  session_key_event_rate: "GA4 fraction (0..1) of sessions triggering any configured key event. NOT key_events/sessions. Weight by sessions only within compatible scopes; hostname cross-domain sessions can overlap.",
  lcp_ms: "LCP in milliseconds. CrUX is rolling field p75; PageSpeed is one Lighthouse lab run. Never combine or sum these sources.",
  inp_ms: "CrUX field INP p75 in milliseconds. NULL for Lighthouse lab runs: TBT is not INP.",
  cls: "Unitless CLS: CrUX field p75 or Lighthouse lab measurement according to source. NULL is unavailable.",
  performance_score: "Lighthouse performance score 0..1, lab only. Not a field Core Web Vitals verdict or SEO ranking score.",
  quality: "GA4 reporting metadata flags: standard, thresholded, sampled, other_row. Standard does not guarantee exhaustive measurement.",
  target_url: "Optional intervention URL. NULL scopes comparison to the project. Observation does not establish causal attribution.",
  project_id: "OpenFindability project ID. Join projects.id; NULL is allowed only for genuinely unmapped account/property-level observations.",
  date: "Provider reporting date, ISO YYYY-MM-DD. Missing rows are not measured zeros. Providers have different delays/timezones.",
  source: "Provider namespace. Google/Bing and GA4/Umami remain independent measurements.",
  currency: "ISO provider currency; NULL means unknown. Never aggregate across distinct or missing currencies.",
  revenue: "Provider-dependent: ads are daily estimates; RevenueCat is rolling 28-day revenue. Use daily_ad_revenue or revenuecat_latest.",
  mrr: "Point-in-time monthly recurring revenue gauge; never sum across snapshot dates.",
  clicks: "Provider-reported click count. Query/page totals may be top-row subsets; do not add them to site totals.",
  impressions: "Provider-reported impressions. Add only compatible source/grain/scope and non-overlapping dates.",
  ctr: "Click-through ratio (0..1), not percent. Recompute sum(clicks)/sum(impressions), never average ratios.",
  avg_position: "Impressions-weighted search position; never average daily averages or combine Google/Bing positions.",
  visitors: "Daily provider user count. Sum is user-days, not unique period users. GA4 and Umami differ.",
  downloads: "First-time App Store downloads. Dates before 2025-09-21 are known inflated; use app_store_daily_quality.trusted_downloads.",
  retention_day1: "Nullable D1 retention placeholder: provider cohort/unit contract not implemented. NULL is unavailable, never zero.",
  retention_day7: "Nullable D7 retention placeholder: provider cohort/unit contract not implemented. NULL is unavailable, never zero.",
  retention_day28: "Nullable D28 retention placeholder: provider cohort/unit contract not implemented. NULL is unavailable, never zero.",
  metrics: "Provider-specific normalized fields encoded as JSON; interpret using source/kind/grain and coverage.",
  coverage: "JSON describing sampling, scope, limits and observed windows; a row does not prove exhaustive coverage.",
  grain: "Aggregation semantics: day/hour/rolling_window/provider_period or snapshot. Never add overlapping windows or gauges across dates.",
  fetched_at: "UTC import timestamp; separate from reporting day or rolling observation window.",
  configured: "Whether collection is currently configured locally. Historical data remains queryable after disabling a source.",
  value: "Metric value; unit/currency/source/grain are mandatory dimensions. NULL is unknown, not zero.",
  sessions: "GA4 daily session count, explicitly projected from local stored reports. Independent of active users and pageviews.",
  key_events: "GA4 daily key event count, not a conversion rate. Event definitions depend on the property configuration.",
  unit: "Count or provider currency unit. Revenue amounts also require currency and grain.",
  trusted_downloads: "Downloads on/after 2025-09-21, NULL for earlier known-inflated history. Original downloads retained for audit.",
};

export async function publishWarehouseComments(c: DuckDBConnection, database: string) {
  const rows = (await c.runAndReadAll("SELECT table_name,column_name,comment FROM duckdb_columns() WHERE database_name=$1 AND schema_name='main'", [database])).getRowObjects();
  for (const row of rows) {
    const table = String(row.table_name), column = String(row.column_name);
    const comment = COMMENTS[column] ?? `OpenFindability ${table}.${column}. See metric_dictionary and the OpenFindability analytics guide for scope and aggregation rules.`;
    if (row.comment !== comment) await c.run(`COMMENT ON COLUMN ${q(database)}.main.${q(table)}.${q(column)} IS '${comment.replaceAll("'", "''")}'`);
  }
  const tables = (await c.runAndReadAll("SELECT table_name AS name,comment,'TABLE' AS kind FROM duckdb_tables() WHERE database_name=$1 AND schema_name='main' UNION ALL SELECT view_name,comment,'VIEW' FROM duckdb_views() WHERE database_name=$1 AND schema_name='main'", [database])).getRowObjects();
  const comment = "OpenFindability selective analytics replica. Read metric_dictionary and data_freshness before analysis; source SQLite remains authoritative.";
  for (const table of tables) if (table.comment !== comment) await c.run(`COMMENT ON ${table.kind} ${q(database)}.main.${q(String(table.name))} IS '${comment}'`);
}
