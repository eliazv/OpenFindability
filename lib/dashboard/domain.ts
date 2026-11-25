import type { AppData } from "@/lib/types";
import {dayRange,comparisonWindow,latestDay,measure,type Observation} from "./metrics";
import type { MetricSpec } from "./read-model";

export function observationModel(spec:MetricSpec,rows:Observation[],days:number,endOverride?:string,comparison:"previous"|"year"="previous"){
 const end=endOverride??latestDay(rows)??new Date().toISOString().slice(0,10);
 return {spec,latest:latestDay(rows.filter(r=>r.value!==null)),result:measure(rows,dayRange(end,days),"snapshot",false,comparisonWindow(dayRange(end,days),comparison))};
}
export function landingGroups(rows:NonNullable<AppData["ga4LandingMetrics"]>){
 const map=new Map<string,{key:string;host:string;landing:string;channel:string;device:string;sourceMedium:string;timeZone:string|null;sessions:number;keyEvents:number;weighted:number;quality:Set<string>}>();
 for(const r of rows){const key=JSON.stringify([r.hostname,r.landingPage,r.channel,r.device,r.sourceMedium,r.timeZone]);const g=map.get(key)??{key,host:r.hostname,landing:r.landingPage,channel:r.channel,device:r.device,sourceMedium:r.sourceMedium,timeZone:r.timeZone,sessions:0,keyEvents:0,weighted:0,quality:new Set<string>()};g.sessions+=r.sessions;g.keyEvents+=r.keyEvents;g.weighted+=r.sessions*r.sessionKeyEventRate;g.quality.add(r.quality);map.set(key,g);}
 return [...map.values()].sort((a,b)=>b.sessions-a.sessions).map(g=>({...g,quality:[...g.quality].join(", "),rate:g.sessions?g.weighted/g.sessions*100:null}));
}
export function adBreakdown(rows:AppData["admobMediationMetrics"]){
 const byCurrency=new Map<string,Map<string,number>>();let excluded=0;
 for(const r of rows){if(!r.currency||!/^[A-Z]{3}$/.test(r.currency)||typeof r.estimatedEarnings!=="number"||!Number.isFinite(r.estimatedEarnings)){excluded++;continue;}
  const map=byCurrency.get(r.currency)??new Map<string,number>();map.set(r.adSourceName,(map.get(r.adSourceName)??0)+r.estimatedEarnings);byCurrency.set(r.currency,map);
 }
 return {excluded,groups:[...byCurrency].map(([currency,map])=>({currency,rows:[...map].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)}))};
}
