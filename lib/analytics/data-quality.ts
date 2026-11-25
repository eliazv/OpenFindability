import {getSqliteHandle,type AppDb} from "@/lib/db/client";
import {configuredSources} from "@/lib/dashboard/read-model";
import {CONNECTOR_CATALOG} from "@/lib/connectors/catalog";
import {shiftDay} from "@/lib/dashboard/metrics";
import type {Project,SourceType} from "@/lib/types";
const dailyTables:Partial<Record<SourceType,string>>={gsc:"metric_snapshots",ga4:"metric_snapshots",umami:"metric_snapshots",ga4_landing:"ga4_landing_metrics",admob:"metric_snapshots",adsense:"metric_snapshots",play_stats:"play_install_stats",play_vitals:"play_vitals_metrics",asc_analytics:"asc_analytics_metrics"};
export function dailyCoverage(database:AppDb,p:Project,source:SourceType,days=30,today=new Date().toISOString().slice(0,10)){
 const table=dailyTables[source];if(!table)return null;
 const n=getSqliteHandle(database),lag=source==="play_vitals"?5:source==="gsc"||source==="ga4"||source==="ga4_landing"?2:1;
 const end=shiftDay(today,-lag),start=shiftDay(end,1-days),condition=table==="metric_snapshots"?" AND source=?":"";
 const args=table==="metric_snapshots"?[p.id,source]:[p.id];
 const first=(n.prepare("SELECT min(date) first FROM "+table+" WHERE project_id=?"+condition).get(...args) as {first:string|null}).first;
 const dates=new Set((n.prepare("SELECT DISTINCT date FROM "+table+" WHERE project_id=?"+condition+" AND date BETWEEN ? AND ?").all(...args,start,end) as {date:string}[]).map(r=>r.date));
 if(source==="admob")for(const r of n.prepare("SELECT DISTINCT date FROM admob_mediation_metrics WHERE project_id=? AND date BETWEEN ? AND ?").all(p.id,start,end) as {date:string}[])dates.add(r.date);
 const gaps:string[]=[];for(let i=0;i<days;i++){const date=shiftDay(start,i);if((!first||date>=first)&&!dates.has(date))gaps.push(date);}
 return {project:p.slug,source,start,end,first,observed:dates.size,missing:gaps,expected:dates.size+gaps.length,lag,note:"Date con righe, non prova di completezza; giorni senza righe restano sconosciuti."};
}
export function qualityRows(database:AppDb,projects:Project[],days=30){return projects.flatMap(p=>configuredSources(p).flatMap(s=>{const q=dailyCoverage(database,p,s,days);return q?[q]:[];}));}
export function incrementalWindow(database:AppDb,p:Project,source:SourceType,today=new Date().toISOString().slice(0,10)){
 const q=dailyCoverage(database,p,source,30,today);if(!q||!q.first)return 30;
 const oldest=q.missing[0];const lag=CONNECTOR_CATALOG[source].typicalLagDays;
 return Math.max(7,lag+1,oldest?Math.round((Date.parse(today)-Date.parse(oldest))/86400000):0);
}
