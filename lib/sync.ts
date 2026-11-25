import { daysAgo, nowIso } from "@/lib/dates";
import { createId } from "@/lib/id";
import { syncGscProject } from "@/lib/connectors/gsc";
import { syncGa4Project } from "@/lib/connectors/ga4";
import { syncGa4LandingProject } from "@/lib/connectors/ga4-landing";
import { syncUmamiProject } from "@/lib/connectors/umami";
import { syncBingProject } from "@/lib/connectors/bing";
import { syncCloudflareProject } from "@/lib/connectors/cloudflare-ai";
import { syncClarityProject } from "@/lib/connectors/clarity";
import { syncPlayConsoleProject } from "@/lib/connectors/play-console";
import { syncAsoProject } from "@/lib/connectors/aso";
import { syncRevenueCatProject } from "@/lib/connectors/revenuecat";
import { syncAdmobProject } from "@/lib/connectors/admob";
import { syncAdsenseProject } from "@/lib/connectors/adsense";
import { syncPlayVitalsProject } from "@/lib/connectors/play-vitals";
import { syncPlayInstallStatsProject } from "@/lib/connectors/play-gcs-stats";
import { syncAscAnalyticsProject } from "@/lib/connectors/appstoreconnect-analytics";
import {refreshProjectArtwork} from "@/lib/dashboard/project-artwork";
import {db} from "@/lib/db/client";
import {readProjects} from "@/lib/store";
import * as persist from "@/lib/sync-store";
import {selectSyncProjects} from "@/lib/sync-project-selection";
import {cliErrorMessage} from "@/lib/cli-error";
import {configuredSources} from "@/lib/dashboard/read-model";
import {incrementalWindow} from "@/lib/analytics/data-quality";
import {refreshSeoOpportunities} from "@/lib/analytics/opportunity-store";
import {and,eq,gte,lte} from "drizzle-orm";
import {seoGeoObservations} from "@/lib/db/schema";
import type {Project,SourceType,SyncOptions,SyncResult,ConnectorRun} from "@/lib/types";
const sources:SourceType[]=["ga4_landing","bing_webmaster","cloudflare_ai","clarity","gsc","ga4","umami","play_console","revenuecat","admob","adsense","play_vitals","play_stats","asc_analytics"];
function runRecord(result:SyncResult,startedAt:string):ConnectorRun{return {id:createId("run"),projectId:result.projectId,source:result.source,status:result.status,startedAt,finishedAt:nowIso(),errorMessage:result.status==="failed"?result.message:undefined,stats:{...result.inserted,message:result.status==="failed"?undefined:result.message}};}
async function fetchSource(p:Project,source:SourceType,days:number):Promise<{result:SyncResult;apply:()=>void}>{
 const start=daysAgo(days),end=daysAgo(2),yesterday=daysAgo(1);
 switch(source){
 case "ga4_landing":{const s=await syncGa4LandingProject(p,start,end);return {result:s.result,apply:()=>{if(s.replace)persist.replaceLanding(db,p.id,start,end,s.rows);}};}
 case "gsc":{const s=await syncGscProject(p,start,end);return {result:s.result,apply:()=>{persist.putMetricSnapshots(db,s.snapshots);persist.replaceGscDays(db,p.id,s.snapshots.map(r=>r.date));persist.putSearchQueries(db,s.queries);persist.putPageMetrics(db,s.pages);persist.putGscDimensionBreakdowns(db,s.breakdowns);persist.putGscSitemaps(db,s.sitemaps);}};}
 case "ga4":{const s=await syncGa4Project(p,start,end);return {result:s.result,apply:()=>persist.putMetricSnapshots(db,s.snapshots)};}
 case "umami":{const s=await syncUmamiProject(p,start,yesterday);return {result:s.result,apply:()=>persist.putMetricSnapshots(db,s.snapshots)};}
 case "aso":{const s=await syncAsoProject(p);return {result:s.result,apply:()=>persist.putAso(db,p,s.keywords)};}
 case "play_console":{const s=await syncPlayConsoleProject(p,start);return {result:s.result,apply:()=>{persist.putAppReviews(db,s.reviews.map(({text,...r})=>({...r,reviewText:text})));persist.putMetricSnapshots(db,s.snapshots);}};}
 case "revenuecat":{const s=await syncRevenueCatProject(p,daysAgo(0));return {result:s.result,apply:()=>persist.putMetricSnapshots(db,s.snapshots)};}
 case "admob":{const s=await syncAdmobProject(p,start,yesterday);return {result:s.result,apply:()=>{persist.putMetricSnapshots(db,s.snapshots);persist.putMediation(db,s.mediationMetrics);}};}
 case "adsense":{const s=await syncAdsenseProject(p,start,yesterday);return {result:s.result,apply:()=>persist.putMetricSnapshots(db,s.snapshots)};}
 case "play_vitals":{const s=await syncPlayVitalsProject(p,start,daysAgo(5));return {result:s.result,apply:()=>persist.putPlayVitalsMetrics(db,s.metrics)};}
 case "play_stats":{const s=await syncPlayInstallStatsProject(p,start,yesterday);return {result:s.result,apply:()=>persist.putPlayInstallStats(db,s.stats)};}
 case "asc_analytics":{const s=await syncAscAnalyticsProject(p,start,yesterday);return {result:s.result,apply:()=>persist.putAscAnalyticsMetrics(db,s.metrics)};}
 case "bing_webmaster":case "cloudflare_ai":case "clarity":{
  const s=await(source==="bing_webmaster"?syncBingProject(p,start,yesterday):source==="cloudflare_ai"?syncCloudflareProject(p):syncClarityProject(p));
  return {result:s.result,apply:()=>{persist.putMetricSnapshots(db,s.snapshots);if("replaceWindow" in s&&s.replaceWindow){const w=s.replaceWindow;db.delete(seoGeoObservations).where(and(eq(seoGeoObservations.projectId,p.id),eq(seoGeoObservations.source,source),eq(seoGeoObservations.kind,w.kind),gte(seoGeoObservations.windowStart,w.start),lte(seoGeoObservations.windowEnd,w.end))).run();}persist.putSeoGeoObservations(db,s.observations);}};
 }
 default:throw new Error("Fonte non sincronizzabile.");
 }
}
export async function syncProjects(options:SyncOptions={}):Promise<SyncResult[]>{
 const all=await readProjects(),projects=selectSyncProjects(all,options.projectSlug);
 const requested=options.backfillDays;
 if(requested!==undefined&&(!Number.isSafeInteger(requested)||requested<1))throw new Error("Invalid backfill days.");
 const jobs=projects.flatMap(p=>(options.source?[options.source]:sources.filter(s=>configuredSources(p).includes(s))).map(source=>({p,source})));
 const lock=persist.acquireSync(db,jobs.length),results:SyncResult[]=[];
 try{
  persist.reconcileLinks(db,all,options.projectSlug?projects[0].id:undefined);
  for(const {p,source} of jobs){
   lock.progress(p.slug,source,results.length);const started=nowIso();
   let result:SyncResult;
   try{const s=await fetchSource(p,source,requested??incrementalWindow(db,p,source));result=s.result;persist.commitSync(db,runRecord(result,started),result.status==="failed"||result.status==="skipped"?()=>{}:s.apply);}
   catch(error){result={source,projectId:p.id,status:"failed",message:cliErrorMessage(error),inserted:{snapshots:0,queries:0,pages:0}};persist.commitSync(db,runRecord(result,started),()=>{});}
   results.push(result);
   if(source==="gsc"&&result.status==="success"){try{refreshSeoOpportunities(db,p.id);}catch(error){console.error("Opportunity refresh failed:",cliErrorMessage(error));}}
  }
  // Public icon lookups are best-effort and cached; do not change analytics result.
  if(!options.source||["asc_analytics","play_console","play_stats"].includes(options.source)){for(let i=0;i<projects.length;i+=3)await Promise.all(projects.slice(i,i+3).map(p=>refreshProjectArtwork(p).catch(()=>{})));}
  return results;
 }finally{lock.release();}
}
