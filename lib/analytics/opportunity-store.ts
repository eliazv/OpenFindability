import {getSqliteHandle,type AppDb} from "@/lib/db/client";
import {buildOpportunitiesFromDetails} from "@/lib/insights";
import {opportunities} from "@/lib/db/schema";
import {eq} from "drizzle-orm";
import type {SearchQueryMetric,PageMetric} from "@/lib/types";
export function refreshSeoOpportunities(database:AppDb,projectId:string){
 const n=getSqliteHandle(database);
 n.transaction(()=>{
 const end=(n.prepare("SELECT max(date) AS date FROM metric_snapshots WHERE project_id=? AND source='gsc'").get(projectId) as {date:string|null}).date;if(!end)return;
 const read=(table:"search_queries"|"page_metrics",group:string,select:string)=>n.prepare(`SELECT ${select},SUM(clicks) clicks,SUM(impressions) impressions,SUM(clicks)*1.0/nullif(SUM(impressions),0) ctr,SUM(avg_position*impressions)*1.0/nullif(SUM(impressions),0) avgPosition FROM ${table} WHERE project_id=? AND date BETWEEN date(?,'-27 days') AND ? AND json_extract(raw_json,'$._openfindability.grain')='day' AND json_extract(raw_json,'$._openfindability.version')=2 GROUP BY ${group}`).all(projectId,end,end) as {query?:string;page:string;clicks:number;impressions:number;ctr:number|null;avgPosition:number|null}[];
 const queries=read("search_queries","query,page","query,page").map((r,i)=>({...r,id:"derived-q-"+i,projectId,date:end,query:r.query!,ctr:r.ctr??0,avgPosition:r.avgPosition??0})) as SearchQueryMetric[];
 const pages=read("page_metrics","page","page").map((r,i)=>({...r,id:"derived-p-"+i,projectId,date:end,ctr:r.ctr??0,avgPosition:r.avgPosition??0})) as PageMetric[];
 const prior=database.select().from(opportunities).where(eq(opportunities.projectId,projectId)).all();
 const key=(r:{type:string;title:string})=>r.type+"\0"+r.title;
 const byKey=new Map(prior.map(r=>[key(r),r]));const detected=buildOpportunitiesFromDetails(queries,pages);
 for(const row of detected){const old=byKey.get(key(row));if(old){database.update(opportunities).set({description:row.description,score:row.score,severity:row.severity,rawJson:{...(old.rawJson&&typeof old.rawJson==="object"?old.rawJson as Record<string,unknown>:{}),evidence:row.rawJson,active:true,lastSeen:row.detectedAt}}).where(eq(opportunities.id,old.id)).run();}else database.insert(opportunities).values({...row,rawJson:{evidence:row.rawJson,active:true,lastSeen:row.detectedAt}}).run();}
 // Keep history and user's decisions, even when a signal drops out of the shortlist.
 const keys=new Set(detected.map(key));for(const old of prior)if(old.status==="open"&&(old.rawJson as {active?:boolean}|undefined)?.active!==false&&!keys.has(key(old))&&["low_ctr_query","striking_distance_query","zero_click_query","page_two_query","low_ctr_page","query_cannibalization"].includes(old.type))database.update(opportunities).set({rawJson:{...(old.rawJson&&typeof old.rawJson==="object"?old.rawJson as Record<string,unknown>:{}),evidence:(old.rawJson as {evidence?:unknown}|undefined)?.evidence??old.rawJson,active:false}}).where(eq(opportunities.id,old.id)).run();
 n.prepare("UPDATE _openfindability_store_revision SET revision=revision+1 WHERE id=1").run();
 }).immediate();
}
