import {and,eq,gte,lte,sql} from "drizzle-orm";
import {getSqliteHandle,type AppDb} from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import type {AppData,Project,ConnectorRun,AdmobMediationMetric,AppKeywordMetric} from "@/lib/types";
import {upsertAsoCacheRows,normalizeKeyword,normalizeCountry} from "@/lib/aso-cache";
import {reconcileGscProjectLinks} from "@/lib/gsc-project-links";
import {randomUUID} from "node:crypto";
function* batches<T>(rows:T[]){for(let i=0;i<rows.length;i+=50)yield rows.slice(i,i+50);}
export function commitSync(database:AppDb,run:ConnectorRun,apply:()=>void){
 const native=getSqliteHandle(database);
 native.transaction(()=>{apply();database.insert(t.connectorRuns).values(run).run();native.prepare("UPDATE _openfindability_store_revision SET revision=revision+1 WHERE id=1").run();}).immediate();
}
export function putMetricSnapshots(database:AppDb,rows:(typeof t.metricSnapshots.$inferInsert)[]){
 for(const batch of batches(rows)) database.insert(t.metricSnapshots).values(batch).onConflictDoUpdate({target:[t.metricSnapshots.projectId,t.metricSnapshots.source,t.metricSnapshots.date],set:{clicks:sql`excluded.clicks`,impressions:sql`excluded.impressions`,ctr:sql`excluded.ctr`,avgPosition:sql`excluded.avg_position`,visitors:sql`excluded.visitors`,pageviews:sql`excluded.pageviews`,sessions:sql`excluded.sessions`,keyEvents:sql`excluded.key_events`,avgRating:sql`excluded.avg_rating`,totalReviews:sql`excluded.total_reviews`,revenue:sql`excluded.revenue`,mrr:sql`excluded.mrr`,activeSubscribers:sql`excluded.active_subscribers`,activeTrials:sql`excluded.active_trials`,newCustomers:sql`excluded.new_customers`,adRequests:sql`excluded.ad_requests`,currency:sql`excluded.currency`,rawJson:sql`excluded.raw_json`,createdAt:sql`excluded.created_at`}}).run();
}
export function putSearchQueries(database:AppDb,rows:(typeof t.searchQueries.$inferInsert)[]){
 for(const batch of batches(rows)) database.insert(t.searchQueries).values(batch).onConflictDoUpdate({target:[t.searchQueries.projectId,t.searchQueries.date,t.searchQueries.query,t.searchQueries.page],set:{clicks:sql`excluded.clicks`,impressions:sql`excluded.impressions`,ctr:sql`excluded.ctr`,avgPosition:sql`excluded.avg_position`,rawJson:sql`excluded.raw_json`}}).run();
}
export function putPageMetrics(database:AppDb,rows:(typeof t.pageMetrics.$inferInsert)[]){
 for(const batch of batches(rows)) database.insert(t.pageMetrics).values(batch).onConflictDoUpdate({target:[t.pageMetrics.projectId,t.pageMetrics.date,t.pageMetrics.page],set:{clicks:sql`excluded.clicks`,impressions:sql`excluded.impressions`,ctr:sql`excluded.ctr`,avgPosition:sql`excluded.avg_position`,rawJson:sql`excluded.raw_json`}}).run();
}
export function putGscDimensionBreakdowns(database:AppDb,rows:(typeof t.gscDimensionBreakdowns.$inferInsert)[]){
 for(const batch of batches(rows)) database.insert(t.gscDimensionBreakdowns).values(batch).onConflictDoUpdate({target:[t.gscDimensionBreakdowns.projectId,t.gscDimensionBreakdowns.rangeStart,t.gscDimensionBreakdowns.rangeEnd,t.gscDimensionBreakdowns.dimension,t.gscDimensionBreakdowns.key],set:{clicks:sql`excluded.clicks`,impressions:sql`excluded.impressions`,ctr:sql`excluded.ctr`,avgPosition:sql`excluded.avg_position`,rawJson:sql`excluded.raw_json`,createdAt:sql`excluded.created_at`}}).run();
}
export function putGscSitemaps(database:AppDb,rows:(typeof t.gscSitemaps.$inferInsert)[]){
 for(const batch of batches(rows)) database.insert(t.gscSitemaps).values(batch).onConflictDoUpdate({target:[t.gscSitemaps.projectId,t.gscSitemaps.path],set:{type:sql`excluded.type`,lastSubmitted:sql`excluded.last_submitted`,isPending:sql`excluded.is_pending`,isSitemapsIndex:sql`excluded.is_sitemaps_index`,warnings:sql`excluded.warnings`,errors:sql`excluded.errors`,rawJson:sql`excluded.raw_json`,createdAt:sql`excluded.created_at`}}).run();
}
export function putPlayVitalsMetrics(database:AppDb,rows:(typeof t.playVitalsMetrics.$inferInsert)[]){
 for(const batch of batches(rows)) database.insert(t.playVitalsMetrics).values(batch).onConflictDoUpdate({target:[t.playVitalsMetrics.projectId,t.playVitalsMetrics.date],set:{crashRate:sql`excluded.crash_rate`,anrRate:sql`excluded.anr_rate`,rawJson:sql`excluded.raw_json`,createdAt:sql`excluded.created_at`}}).run();
}
export function putPlayInstallStats(database:AppDb,rows:(typeof t.playInstallStats.$inferInsert)[]){
 for(const batch of batches(rows)) database.insert(t.playInstallStats).values(batch).onConflictDoUpdate({target:[t.playInstallStats.projectId,t.playInstallStats.date],set:{installs:sql`excluded.installs`,uninstalls:sql`excluded.uninstalls`,activeDeviceInstalls:sql`excluded.active_device_installs`,userInstalls:sql`excluded.user_installs`,userUninstalls:sql`excluded.user_uninstalls`,installEvents:sql`excluded.install_events`,uninstallEvents:sql`excluded.uninstall_events`,rawJson:sql`excluded.raw_json`,createdAt:sql`excluded.created_at`}}).run();
}
export function putAscAnalyticsMetrics(database:AppDb,rows:(typeof t.ascAnalyticsMetrics.$inferInsert)[]){
 for(const batch of batches(rows)) database.insert(t.ascAnalyticsMetrics).values(batch).onConflictDoUpdate({target:[t.ascAnalyticsMetrics.projectId,t.ascAnalyticsMetrics.date],set:{downloads:sql`excluded.downloads`,retentionDay1:sql`excluded.retention_day1`,retentionDay7:sql`excluded.retention_day7`,retentionDay28:sql`excluded.retention_day28`,rawJson:sql`excluded.raw_json`,createdAt:sql`excluded.created_at`}}).run();
}
export function putSeoGeoObservations(database:AppDb,rows:(typeof t.seoGeoObservations.$inferInsert)[]){
 for(const batch of batches(rows)) database.insert(t.seoGeoObservations).values(batch).onConflictDoUpdate({target:[t.seoGeoObservations.source,t.seoGeoObservations.projectId,t.seoGeoObservations.kind,t.seoGeoObservations.recordKey],set:{windowStart:sql`excluded.window_start`,windowEnd:sql`excluded.window_end`,grain:sql`excluded.grain`,scope:sql`excluded.scope`,metrics:sql`excluded.metrics`,coverage:sql`excluded.coverage`,rawJson:sql`excluded.raw_json`,fetchedAt:sql`excluded.fetched_at`}}).run();
}
export function putGa4LandingMetrics(database:AppDb,rows:(typeof t.ga4LandingMetrics.$inferInsert)[]){
 for(const batch of batches(rows)) database.insert(t.ga4LandingMetrics).values(batch).onConflictDoUpdate({target:[t.ga4LandingMetrics.projectId,t.ga4LandingMetrics.date,t.ga4LandingMetrics.hostname,t.ga4LandingMetrics.landingPage,t.ga4LandingMetrics.channel,t.ga4LandingMetrics.sourceMedium,t.ga4LandingMetrics.device],set:{sessions:sql`excluded.sessions`,engagedSessions:sql`excluded.engaged_sessions`,keyEvents:sql`excluded.key_events`,sessionKeyEventRate:sql`excluded.session_key_event_rate`,timeZone:sql`excluded.time_zone`,quality:sql`excluded.quality`,rawJson:sql`excluded.raw_json`,fetchedAt:sql`excluded.fetched_at`}}).run();
}
export function putAppReviews(database:AppDb,rows:(typeof t.appReviews.$inferInsert)[]){
 for(const batch of batches(rows)) database.insert(t.appReviews).values(batch).onConflictDoUpdate({target:[t.appReviews.projectId,t.appReviews.reviewId],set:{date:sql`excluded.date`,rating:sql`excluded.rating`,reviewText:sql`excluded.text`,language:sql`excluded.language`,appVersionName:sql`excluded.app_version_name`,thumbsUp:sql`excluded.thumbs_up`,rawJson:sql`excluded.raw_json`,createdAt:sql`excluded.created_at`}}).run();
}

export function replaceGscDays(database:AppDb,id:string,days:string[]){
 const native=getSqliteHandle(database);
 for(const table of ["search_queries","page_metrics"] as const){
  const stmt=native.prepare("DELETE FROM "+table+" WHERE project_id=? AND date=? AND json_extract(raw_json,'$._openfindability.grain')='day' AND json_extract(raw_json,'$._openfindability.version')=2");
  for(const date of new Set(days))stmt.run(id,date);
 }
}
export function replaceLanding(database:AppDb,id:string,start:string,end:string,rows:(typeof t.ga4LandingMetrics.$inferInsert)[]){
 database.delete(t.ga4LandingMetrics).where(and(eq(t.ga4LandingMetrics.projectId,id),gte(t.ga4LandingMetrics.date,start),lte(t.ga4LandingMetrics.date,end))).run();putGa4LandingMetrics(database,rows);
}
export function putMediation(database:AppDb,rows:AdmobMediationMetric[]){
 const native=getSqliteHandle(database),del=native.prepare("DELETE FROM admob_mediation_metrics WHERE project_id=? AND date=? AND coalesce(ad_source_id,ad_source_name)=? AND coalesce(format,'')=?");
 for(const row of rows){del.run(row.projectId,row.date,row.adSourceId??row.adSourceName,row.format??"");database.insert(t.admobMediationMetrics).values(row).run();}
}
export function putAso(database:AppDb,project:Project,rows:AppKeywordMetric[]){
 const native=getSqliteHandle(database),cache={asoKeywordSnapshots:[],asoAppRankSnapshots:[]} as unknown as AppData;
 upsertAsoCacheRows(cache,rows,{projectId:project.id,appId:project.respectAsoAppId??project.appStoreTrackId});
 for(const row of rows){native.prepare("DELETE FROM app_keywords WHERE project_id=? AND date=? AND lower(trim(keyword))=? AND lower(trim(country))=?").run(project.id,row.date,normalizeKeyword(row.keyword),normalizeCountry(row.country));database.insert(t.appKeywords).values(row).run();}
 for(const row of cache.asoKeywordSnapshots){native.prepare("DELETE FROM aso_keyword_snapshots WHERE source=? AND date=? AND lower(trim(keyword))=? AND lower(trim(country))=?").run(row.source,row.date,normalizeKeyword(row.keyword),normalizeCountry(row.country));database.insert(t.asoKeywordSnapshots).values(row).run();}
 for(const row of cache.asoAppRankSnapshots){native.prepare("DELETE FROM aso_app_rank_snapshots WHERE source=? AND date=? AND project_id IS ? AND app_id IS ? AND lower(trim(keyword))=? AND lower(trim(country))=?").run(row.source,row.date,row.projectId??null,row.appId??null,normalizeKeyword(row.keyword),normalizeCountry(row.country));database.insert(t.asoAppRankSnapshots).values(row).run();}
}
export function reconcileLinks(database:AppDb,projects:Project[],projectId?:string){
 const native=getSqliteHandle(database);
 native.transaction(()=>{
 const inspections=database.select().from(t.gscIndexInspections).where(sql`${t.gscIndexInspections.projectId} IS NULL`).all();
 const runs=database.select().from(t.connectorRuns).where(and(eq(t.connectorRuns.source,"gsc_index"),sql`${t.connectorRuns.projectId} IS NULL`)).all();
 const data={projects,gscIndexInspections:inspections,connectorRuns:runs} as unknown as Pick<AppData,"projects"|"gscIndexInspections"|"connectorRuns">;
 const result=reconcileGscProjectLinks(data,projectId);
 for(const row of data.gscIndexInspections)if(row.projectId)database.update(t.gscIndexInspections).set({projectId:row.projectId}).where(eq(t.gscIndexInspections.id,row.id)).run();
 for(const row of data.connectorRuns)if(row.projectId)database.update(t.connectorRuns).set({projectId:row.projectId}).where(eq(t.connectorRuns.id,row.id)).run();
 if(result.inspections||result.runs)native.prepare("UPDATE _openfindability_store_revision SET revision=revision+1 WHERE id=1").run();
 }).immediate();
}
// Operational lock, like the store revision: no analytical schema changes.
function lockTable(database:AppDb){const n=getSqliteHandle(database);n.exec("CREATE TABLE IF NOT EXISTS _openfindability_sync_lock (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL,pid INTEGER NOT NULL,started TEXT NOT NULL,project TEXT,source TEXT,completed INTEGER NOT NULL,total INTEGER NOT NULL)");return n;}
function alive(pid:number){try{process.kill(pid,0);return true;}catch(e){return (e as NodeJS.ErrnoException).code!=="ESRCH";}}
export class SyncAlreadyRunning extends Error{constructor(){super("Una sincronizzazione è già in corso.");}}
export function acquireSync(database:AppDb,total:number){
 const n=lockTable(database),token=randomUUID();
 n.transaction(()=>{const row=n.prepare("SELECT pid FROM _openfindability_sync_lock WHERE id=1").get() as {pid:number}|undefined;if(row&&alive(row.pid))throw new SyncAlreadyRunning();n.prepare("DELETE FROM _openfindability_sync_lock").run();n.prepare("INSERT INTO _openfindability_sync_lock VALUES(1,?,?,?,NULL,NULL,0,?)").run(token,process.pid,new Date().toISOString(),total);}).immediate();
 return {progress(project:string,source:string,completed:number){n.prepare("UPDATE _openfindability_sync_lock SET project=?,source=?,completed=? WHERE token=?").run(project,source,completed,token);},release(){n.prepare("DELETE FROM _openfindability_sync_lock WHERE token=?").run(token);}};
}
export function syncProgress(database:AppDb){
 const n=getSqliteHandle(database);if(!n.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_openfindability_sync_lock'").get())return null;
 const row=n.prepare("SELECT pid,started,project,source,completed,total FROM _openfindability_sync_lock WHERE id=1").get() as {pid:number;started:string;project:string|null;source:string|null;completed:number;total:number}|undefined;
 if(!row||!alive(row.pid))return null;const {pid,...progress}=row;return progress;
}
