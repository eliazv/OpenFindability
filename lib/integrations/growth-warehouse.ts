import type { DuckDBConnection } from "@duckdb/node-api";

// d is an already quoted catalog/schema identifier supplied by warehouse-semantics.
export async function createGrowthWarehouseViews(c:DuckDBConnection,d:string) {
  await c.run(`CREATE OR REPLACE VIEW ${d}.ga4_landing_daily AS
    SELECT g.*,p.slug,'property-configured key events; hostname sessions may overlap on cross-domain properties' AS scope_note
    FROM ${d}.ga4_landing_metrics g JOIN ${d}.projects p ON p.id=g.project_id`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.ga4_landing_monthly AS
    SELECT project_id,hostname,landing_page,channel,source_medium,device,time_zone,substr(date,1,7) report_month,
      min(date) first_date,max(date) last_date,count(DISTINCT date) days_with_rows,sum(sessions) sessions,sum(engaged_sessions) engaged_sessions,
      sum(key_events) key_events,sum(session_key_event_rate*sessions)/nullif(sum(sessions),0) session_key_event_rate,
      bool_or(quality<>'standard') quality_limited
    FROM ${d}.ga4_landing_metrics GROUP BY project_id,hostname,landing_page,channel,source_medium,device,time_zone,substr(date,1,7)`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.web_performance_latest AS SELECT *,
    CASE WHEN source='crux' THEN 'field_p75_rolling' ELSE 'lighthouse_lab_snapshot' END measurement_kind,
    date_diff('day',try_cast(fetched_at AS TIMESTAMPTZ),current_timestamp) age_days
    FROM ${d}.web_performance_metrics QUALIFY row_number() OVER(PARTITION BY project_id,source,url,scope,device ORDER BY fetched_at DESC,id DESC)=1`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.intervention_windows AS
    SELECT i.*,w.period,
      cast(cast(i.date AS DATE)+CASE WHEN w.period='before' THEN -28 ELSE 1 END AS VARCHAR) period_start,
      cast(cast(i.date AS DATE)+CASE WHEN w.period='before' THEN -1 ELSE 28 END AS VARCHAR) period_end,28 expected_days
    FROM ${d}.project_interventions i CROSS JOIN (VALUES ('before'),('after')) w(period)`);
  // Aggregate first, then join. Never multiply GSC detail by GA4 dimensions.
  await c.run(`CREATE OR REPLACE VIEW ${d}.intervention_daily_metrics AS
    WITH traffic AS (
      SELECT project_id,date,'gsc' AS source,CAST(NULL AS VARCHAR) AS target_url,'clicks' AS metric,sum(clicks)::DOUBLE AS value,false AS quality_limited FROM ${d}.metric_snapshots WHERE source='gsc' AND clicks IS NOT NULL GROUP BY project_id,date
      UNION ALL SELECT project_id,date,'gsc',NULL,'impressions',sum(impressions),false FROM ${d}.metric_snapshots WHERE source='gsc' AND impressions IS NOT NULL GROUP BY project_id,date
      UNION ALL SELECT project_id,date,'gsc',page,'clicks',sum(clicks),false FROM ${d}.page_metrics GROUP BY project_id,date,page
      UNION ALL SELECT project_id,date,'gsc',page,'impressions',sum(impressions),false FROM ${d}.page_metrics GROUP BY project_id,date,page
      UNION ALL SELECT project_id,date,'ga4_landing',NULL,'sessions',sum(sessions),bool_or(quality<>'standard') FROM ${d}.ga4_landing_metrics GROUP BY project_id,date
      UNION ALL SELECT project_id,date,'ga4_landing',NULL,'key_events',sum(key_events),bool_or(quality<>'standard') FROM ${d}.ga4_landing_metrics GROUP BY project_id,date
      UNION ALL SELECT g.project_id,g.date,'ga4_landing',regexp_extract(p.website_url,'^(https?://[^/]+)',1)||g.landing_page,'sessions',sum(g.sessions),bool_or(g.quality<>'standard')
        FROM ${d}.ga4_landing_metrics g JOIN ${d}.projects p ON p.id=g.project_id WHERE g.hostname=regexp_extract(p.website_url,'^https?://([^/:]+)',1) AND starts_with(g.landing_page,'/') GROUP BY g.project_id,g.date,p.website_url,g.landing_page
      UNION ALL SELECT g.project_id,g.date,'ga4_landing',regexp_extract(p.website_url,'^(https?://[^/]+)',1)||g.landing_page,'key_events',sum(g.key_events),bool_or(g.quality<>'standard')
        FROM ${d}.ga4_landing_metrics g JOIN ${d}.projects p ON p.id=g.project_id WHERE g.hostname=regexp_extract(p.website_url,'^https?://([^/:]+)',1) AND starts_with(g.landing_page,'/') GROUP BY g.project_id,g.date,p.website_url,g.landing_page
    ) SELECT w.id intervention_id,w.project_id,w.period,w.period_start,w.period_end,w.expected_days,t.date,t.source,t.metric,t.value,t.quality_limited
      FROM ${d}.intervention_windows w JOIN traffic t ON t.project_id=w.project_id AND t.target_url IS NOT DISTINCT FROM w.target_url
      AND t.date BETWEEN w.period_start AND w.period_end AND try_cast(t.date AS DATE)<current_date`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.intervention_summary AS
    WITH totals AS (SELECT intervention_id,period,source,metric,count(DISTINCT date) AS days_with_rows,sum(value) AS value,bool_or(quality_limited) AS quality_limited
      FROM ${d}.intervention_daily_metrics GROUP BY intervention_id,period,source,metric)
    SELECT w.id intervention_id,w.project_id,w.period,w.period_start,w.period_end,w.expected_days,k.source,k.metric,
      coalesce(t.days_with_rows,0) days_with_rows,t.value,t.quality_limited,
      coalesce(t.days_with_rows,0)=w.expected_days AND try_cast(w.period_end AS DATE)<current_date AS complete,
      'descriptive comparison; no causal inference; missing rows unknown; check overlapping interventions, timezones and seasonality' caveat
    FROM ${d}.intervention_windows w CROSS JOIN (VALUES ('gsc','clicks'),('gsc','impressions'),('ga4_landing','sessions'),('ga4_landing','key_events')) k(source,metric)
    LEFT JOIN totals t ON t.intervention_id=w.id AND t.period=w.period AND t.source=k.source AND t.metric=k.metric`);
  for(const [key,definition] of Object.entries({ga4_landing_daily:"Daily hostname/landing/channel/source-medium/device observations. Key events are property-defined. Preserve time zone and quality flags; cross-domain hostname sessions may overlap. Never add these to GA4 project totals.",ga4_landing_monthly:"Session-weighted provider sessionKeyEventRate, not keyEvents/sessions. Partial months require aligned periods. No period unique users.",web_performance_latest:"Latest observation including explicit no_data; inspect age_days. CrUX field rolling p75 and Lighthouse lab are separate. INP missing in lab; TBT is not a substitute.",intervention_summary:"Fixed 28-day before/after windows excluding intervention day. Missing periods have NULL value, not zero; complete requires 28 observed dates. No automatic causal claim. Private notes/reference excluded from warehouse."})) await c.run(`INSERT OR REPLACE INTO ${d}.metric_dictionary VALUES ($1,$2)`,[key,definition]);
}
