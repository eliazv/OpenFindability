import { interventionOutcome, isoDay } from "./interventions";
import type { AppData } from "@/lib/types";

export function growthEvidenceSnapshot(data:Pick<AppData,"projects"|"projectInterventions"|"ga4LandingMetrics"|"webPerformanceMetrics"|"metricSnapshots"|"pageMetrics"|"connectorRuns">,slug:string,start:string,end:string,limit=50) {
  isoDay(start);isoDay(end);
  if(start>end || !Number.isSafeInteger(limit)||limit<1||limit>200)throw new Error("Invalid report range or limit (1..200).");
  const project=data.projects.find(p=>p.slug===slug);
  if(!project)throw new Error("Project not found.");
  const rows=(data.ga4LandingMetrics??[]).filter(r=>r.projectId===project.id && r.date>=start && r.date<=end);
  const groups=new Map<string,{hostname:string;landingPage:string;channel:string;sourceMedium:string;device:string;timeZone:string|null;sessions:number;engagedSessions:number;keyEvents:number;weightedRate:number;dates:Set<string>;quality:Set<string>}>();
  for(const row of rows) {
    const {hostname,landingPage,channel,sourceMedium,device,timeZone}=row;
    const key=JSON.stringify([hostname,landingPage,channel,sourceMedium,device,timeZone]);
    const group=groups.get(key)??{hostname,landingPage,channel,sourceMedium,device,timeZone,sessions:0,engagedSessions:0,keyEvents:0,weightedRate:0,dates:new Set<string>(),quality:new Set<string>()};
    group.sessions+=row.sessions;group.engagedSessions+=row.engagedSessions;group.keyEvents+=row.keyEvents;group.weightedRate+=row.sessions*row.sessionKeyEventRate;group.dates.add(row.date);group.quality.add(row.quality);groups.set(key,group);
  }
  const latest=new Map<string,NonNullable<AppData["webPerformanceMetrics"]>[number]>();
  for(const row of data.webPerformanceMetrics??[]) {
    if(row.projectId!==project.id)continue;
    const key=JSON.stringify([row.source,row.url,row.scope,row.device]);
    if(!latest.has(key)||latest.get(key)!.fetchedAt<row.fetchedAt)latest.set(key,row);
  }
  const runs=data.connectorRuns.filter(r=>r.projectId===project.id && ["ga4_landing","pagespeed","crux"].includes(r.source));
  return {project:{id:project.id,slug:project.slug,name:project.name},range:{start,end},landingCoverage:{rows:rows.length,daysWithRows:new Set(rows.map(r=>r.date)).size,groups:groups.size,returnedGroups:Math.min(groups.size,limit)},
    landings:[...groups.values()].sort((a,b)=>b.sessions-a.sessions).slice(0,limit).map(({weightedRate,dates,quality,...g})=>({...g,sessionKeyEventRate:g.sessions?weightedRate/g.sessions:null,daysWithRows:dates.size,quality:[...quality]})),
    performance:[...latest.values()].sort((a,b)=>b.fetchedAt.localeCompare(a.fetchedAt)).slice(0,limit).map(({rawJson,...row})=>({...row,ageDays:Math.floor((Date.now()-Date.parse(row.fetchedAt))/86400000),measurementKind:row.source==="crux"?"field_p75_rolling":"lighthouse_lab_snapshot"})),
    interventions:(data.projectInterventions??[]).filter(r=>r.projectId===project.id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,limit).map(item=>interventionOutcome(data,item)),
    latestRuns:[...new Set(runs.map(r=>r.source))].map(source=>{const run=runs.filter(r=>r.source===source).sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt))[0];return {source,status:run.status,finishedAt:run.finishedAt};}),
    caveats:["GA4 key events depend on property configuration; sessionKeyEventRate is provider-reported and session-weighted, not keyEvents/sessions.","Hostname scopes can overlap for cross-domain properties. Do not add landing rows to project totals. Missing days are unknown; standard metadata does not prove exhaustive tracking.","Performance is latest available, independently of the GA4 report range; no_data does not mean poor performance. CrUX field p75 and Lighthouse lab results remain separate.","Interventions use their own 28-day windows; incomplete periods are not extrapolated and changes do not prove causality."]};
}
