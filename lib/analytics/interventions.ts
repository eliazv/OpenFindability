import { createId } from "@/lib/id";
import { isDailyGscDetail } from "@/lib/gsc-detail";
import { publicPageUrl } from "@/lib/connectors/web-performance";
import type { AppData, Project } from "@/lib/types";

export type Intervention = NonNullable<AppData["projectInterventions"]>[number];
export function isoDay(value:string):string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value) throw new Error("Date must be a valid YYYY-MM-DD.");
  return value;
}
export function makeIntervention(project:Project,input:{id?:string;date:string;title:string;kind:string;url?:string;reference?:string;notes?:string},existing?:Intervention):Intervention {
  if(input.id && !/^[a-zA-Z0-9_-]{1,128}$/.test(input.id))throw new Error("Intervention ID must contain 1..128 letters, digits, underscores or hyphens.");
  if (!input.title.trim() || input.title.length>300 || !/^[a-z][a-z0-9_-]{0,49}$/.test(input.kind)) throw new Error("Provide a title (max 300 characters) and a kind such as content, title, template, performance or tracking.");
  if (existing && existing.projectId!==project.id) throw new Error("Cannot move an intervention to another project.");
  if(input.url && !project.websiteUrl)throw new Error("Configure a website URL before recording a page intervention.");
  const now=new Date().toISOString();
  return {id:input.id??existing?.id??createId("intervention"),projectId:project.id,date:isoDay(input.date),title:input.title.trim(),kind:input.kind,
    targetUrl:input.url!==undefined?(input.url?publicPageUrl(input.url,project.websiteUrl):null):existing?.targetUrl??null,reference:input.reference??existing?.reference??null,notes:input.notes??existing?.notes??null,createdAt:existing?.createdAt??now,updatedAt:now};
}
const shift=(date:string,n:number)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);

export function interventionOutcome(data:Pick<AppData,"projectInterventions"|"ga4LandingMetrics"|"metricSnapshots"|"pageMetrics">,item:Intervention,days=28,today=new Date().toISOString().slice(0,10)) {
  if (!Number.isSafeInteger(days)||days<1||days>90) throw new Error("Comparison days must be 1..90.");
  isoDay(today);
  const windows=[{name:"before",start:shift(item.date,-days),end:shift(item.date,-1)},{name:"after",start:shift(item.date,1),end:shift(item.date,days)}];
  const target=item.targetUrl?new URL(item.targetUrl):null;
  const matches=(url:string)=>{if(!target)return true;try{const candidate=new URL(url);return candidate.origin===target.origin && candidate.pathname===target.pathname && !candidate.search;}catch{return false;}};
  const observations=windows.flatMap(window=>{
    const inRange=(date:string)=>date>=window.start && date<=window.end && date<today;
    const gsc=target?data.pageMetrics.filter(r=>r.projectId===item.projectId && inRange(r.date) && isDailyGscDetail(r) && matches(r.page)):
      data.metricSnapshots.filter(r=>r.projectId===item.projectId && r.source==="gsc" && inRange(r.date));
    const ga4=(data.ga4LandingMetrics??[]).filter(r=>r.projectId===item.projectId && inRange(r.date) && (!target || (r.hostname===target.hostname && r.landingPage===target.pathname)));
    const sources:{source:string;rows:{date:string}[];values:Record<string,number|null>}[]=[{source:"gsc",rows:gsc,values:{clicks:gsc.reduce((s,r)=>s+(r.clicks??0),0),impressions:gsc.reduce((s,r)=>s+(r.impressions??0),0)}},
      {source:"ga4_landing",rows:ga4,values:{sessions:ga4.reduce((s,r)=>s+r.sessions,0),keyEvents:ga4.reduce((s,r)=>s+r.keyEvents,0),sessionKeyEventRate:ga4.reduce((s,r)=>s+r.sessions,0)?ga4.reduce((s,r)=>s+r.sessions*r.sessionKeyEventRate,0)/ga4.reduce((s,r)=>s+r.sessions,0):null}}];
    return sources.map(({source,rows,values})=>{
      const dates=new Set(rows.map(r=>r.date)), available=rows.length>0;
      return {window:window.name,start:window.start,end:window.end,source,daysExpected:days,daysWithRows:dates.size,lastDateWithRows:[...dates].sort().at(-1)??null,
        complete:dates.size===days && window.end<today,quality:source==="ga4_landing"?[...new Set(ga4.map(r=>r.quality))]:[],values:available?values:null};
    });
  });
  const changes=observations.filter(r=>r.window==="before").map(before=>{
    const after=observations.find(r=>r.source===before.source && r.window==="after")!;
    if(!before.complete || !after.complete || !before.values || !after.values) return {source:before.source,status:"insufficient_coverage",metrics:null};
    const b=before.values as Record<string,number|null>,a=after.values as Record<string,number|null>;
    return {source:before.source,status:[...before.quality,...after.quality].some(q=>q!=="standard")?"quality_limited":"comparable",metrics:Object.fromEntries(Object.keys(b).map(key=>[key,{before:b[key],after:a[key],delta:b[key]===null||a[key]===null?null:a[key]!-b[key]!,relativeChange:b[key]===null||a[key]===null||b[key]===0?null:(a[key]!-b[key]!)/b[key]!}]))};
  });
  return {intervention:{id:item.id,projectId:item.projectId,date:item.date,title:item.title,kind:item.kind,targetUrl:item.targetUrl},days,observations,changes,
    concurrentInterventions:(data.projectInterventions??[]).filter(r=>r.id!==item.id && r.projectId===item.projectId && r.date>=windows[0].start && r.date<=windows[1].end).map(r=>({id:r.id,date:r.date,title:r.title})),
    caveats:["Descriptive comparison, not causal attribution. Intervention day excluded; no extrapolation or invented zeros.","GA4 property time zone can differ from GSC. Key events depend on property definitions; hostName may make cross-domain session totals non-additive.","Page comparison uses exact origin/path without query strings. Missing top-row pages do not prove zero traffic. Check seasonality and concurrent changes."]};
}
