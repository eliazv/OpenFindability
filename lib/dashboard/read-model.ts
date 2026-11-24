import type { AppData, Project, SourceType } from "@/lib/types";
import { dayRange, latestDay, measure, measureRatio, snapshotObservations, type Observation } from "./metrics";
import { CONNECTOR_CATALOG } from "@/lib/connectors/catalog";

export type MetricSpec = { source: SourceType; key: string; label: string; unit: "count"|"currency"|"percent"|"decimal"; kind?: "snapshot" | "ratio"; lowerBetter?: boolean; precision?: number };
export const METRICS = {
  clicks:{source:"gsc",key:"clicks",label:"Click organici",unit:"count"},
  impressions:{source:"gsc",key:"impressions",label:"Impression",unit:"count"},
  ctr:{source:"gsc",key:"ctr",label:"CTR",unit:"percent",kind:"ratio"},
  position:{source:"gsc",key:"avgPosition",label:"Posizione media",unit:"decimal",kind:"ratio",lowerBetter:true,precision:1},
  sessions:{source:"ga4",key:"sessions",label:"Sessioni GA4",unit:"count"},
  gaUsers:{source:"ga4",key:"visitors",label:"Utenti attivi/giorno (somma)",unit:"count"},
  gaViews:{source:"ga4",key:"pageviews",label:"Visualizzazioni GA4",unit:"count"},
  gaEvents:{source:"ga4",key:"keyEvents",label:"Eventi chiave GA4",unit:"decimal"},
  umamiViews:{source:"umami",key:"pageviews",label:"Pagine viste Umami",unit:"count"},
  visitors:{source:"umami",key:"visitors",label:"Visitatori/giorno (somma)",unit:"count"},
  downloads:{source:"asc_analytics",key:"downloads",label:"Primi download iOS",unit:"count"},
  installs:{source:"play_stats",key:"userInstalls",label:"Installazioni utenti Android",unit:"count"},
  deviceInstalls:{source:"play_stats",key:"installs",label:"Installazioni dispositivi Android",unit:"count"},
  deviceUninstalls:{source:"play_stats",key:"uninstalls",label:"Disinstallazioni dispositivi Android",unit:"count",lowerBetter:true},
  uninstallEvents:{source:"play_stats",key:"uninstallEvents",label:"Eventi disinstallazione Android",unit:"count",lowerBetter:true},
  rating:{source:"play_console",key:"avgRating",label:"Valutazione Play Store",unit:"decimal",kind:"snapshot",precision:2},
  reviewCount:{source:"play_console",key:"totalReviews",label:"Totale recensioni Play",unit:"count",kind:"snapshot"},
  events:{source:"play_stats",key:"installEvents",label:"Eventi installazione Android",unit:"count"},
  uninstalls:{source:"play_stats",key:"userUninstalls",label:"Disinstallazioni utenti Android",unit:"count",lowerBetter:true},
  devices:{source:"play_stats",key:"activeDeviceInstalls",label:"Dispositivi attivi Android",unit:"count",kind:"snapshot"},
  crash:{source:"play_vitals",key:"crashRate",label:"Crash percepiti (valore API)",unit:"decimal",kind:"snapshot",lowerBetter:true,precision:6},
  anr:{source:"play_vitals",key:"anrRate",label:"ANR percepiti (valore API)",unit:"decimal",kind:"snapshot",lowerBetter:true,precision:6},
  mrr:{source:"revenuecat",key:"mrr",label:"MRR",unit:"currency",kind:"snapshot"},
  subscribers:{source:"revenuecat",key:"activeSubscribers",label:"Abbonati attivi",unit:"count",kind:"snapshot"},
  trials:{source:"revenuecat",key:"activeTrials",label:"Trial attivi",unit:"count",kind:"snapshot"},
  customers:{source:"revenuecat",key:"newCustomers",label:"Nuovi clienti (snapshot)",unit:"count",kind:"snapshot"},
  rollingRevenue:{source:"revenuecat",key:"revenue",label:"Ricavi ultimi 28 giorni",unit:"currency",kind:"snapshot"},
  ads:{source:"admob",key:"revenue",label:"Ricavi AdMob",unit:"currency"},
  adsense:{source:"adsense",key:"revenue",label:"Ricavi AdSense",unit:"currency"},
} as const satisfies Record<string,MetricSpec>;
function observed(row:{date:string},value:number|null|undefined):Observation {return {date:row.date,value:value??null};}
export function metricObservations(data:AppData,id:string,spec:MetricSpec):Observation[]{
  if(spec.source==="play_vitals") return data.playVitalsMetrics.filter(r=>r.projectId===id).map(r=>observed(r,r[spec.key as "crashRate"|"anrRate"]));
  if(spec.source==="asc_analytics") return data.ascAnalyticsMetrics.filter(r=>r.projectId===id&&r.date>="2025-09-21").map(r=>observed(r,r.downloads));
  if(spec.source==="play_stats") return data.playInstallStats.filter(r=>r.projectId===id).map(r=>observed(r,r[spec.key as "userInstalls"|"userUninstalls"|"installEvents"|"activeDeviceInstalls"|"installs"|"uninstalls"|"uninstallEvents"]));
  const rows=data.metricSnapshots.filter(r=>r.projectId===id&&r.source===spec.source&&(spec.source!=="umami"||r.date>="2026-08-08"));
  if(spec.source==="admob"){
    const map=new Map(snapshotObservations(rows,"revenue").map(r=>[r.date,r]));
    const mediation=new Map<string,typeof data.admobMediationMetrics>();
    for(const row of data.admobMediationMetrics.filter(r=>r.projectId===id)){const group=mediation.get(row.date)??[];group.push(row);mediation.set(row.date,group);}
    for(const [date,group] of mediation){
      const currencies=new Set(group.map(r=>r.currency));
      const complete=currencies.size===1&&!!group[0].currency&&group.every(r=>typeof r.estimatedEarnings==="number");
      map.set(date,{date,value:complete?group.reduce((s,r)=>s+r.estimatedEarnings!,0):null,currency:complete?group[0].currency:undefined});
    }
    return [...map.values()];
  }
  return snapshotObservations(rows,spec.key as keyof typeof rows[number]);
}
export function projectMetric(data:AppData,id:string,spec:MetricSpec,days:number,end?:string){
  const observations=metricObservations(data,id,spec);
  const latest=latestDay(observations);
  const range=dayRange(end??latest??new Date().toISOString().slice(0,10),days);
  if(spec.kind==="ratio"){
    const rows=data.metricSnapshots.filter(r=>r.projectId===id&&r.source===spec.source);
    const dedup=new Map<string,typeof rows[number]>();
    for(const row of rows)if(!dedup.has(row.date)||dedup.get(row.date)!.createdAt<row.createdAt)dedup.set(row.date,row);
    return {spec,latest,result:measureRatio([...dedup.values()].map(r=>({date:r.date,denominator:r.impressions??null,numerator:spec.key==="ctr"?r.clicks??null:r.avgPosition!==undefined&&r.impressions!==undefined?r.avgPosition*r.impressions:null})),range,spec.key==="ctr"?100:1)};
  }
  return {spec,latest,result:measure(observations,range,spec.kind??"sum",spec.unit==="currency")};
}
export function openOpportunities(data:AppData,id?:string){
  const severity={high:3,medium:2,low:1};
  return data.opportunities.filter(r=>r.status==="open"&&(!id||r.projectId===id)).sort((a,b)=>severity[b.severity]-severity[a.severity]||b.score-a.score||b.detectedAt.localeCompare(a.detectedAt));
}
export function configuredSources(p:Project):SourceType[]{
 const flags:Partial<Record<SourceType,boolean>>={gsc:!!p.gscProperty,ga4:!!p.ga4PropertyId,ga4_landing:!!(p.ga4PropertyId&&p.websiteUrl),umami:!!p.umamiWebsiteId,bing_webmaster:!!p.bingSiteUrl,cloudflare_ai:!!p.cloudflareZoneId,clarity:!!(p.clarityProjectId&&p.clarityTokenEnv),play_console:!!p.playConsolePackageName,play_stats:!!p.playConsolePackageName,play_vitals:!!p.playConsolePackageName,asc_analytics:!!p.appStoreTrackId,aso:!!p.asoKeywords?.length,revenuecat:!!p.revenueCatProjectId,admob:!!(p.admobAppId||p.admobAppIdIos),adsense:!!p.adsenseSiteDomain};
 return (Object.keys(flags) as SourceType[]).filter(s=>flags[s]);
}
export function sourceRows(data:AppData,p:Project){
 const id=p.id;
 const sources=new Set(configuredSources(p));
 for(const source of ["pagespeed","crux"] as const)if((data.webPerformanceMetrics??[]).some(r=>r.projectId===id&&r.source===source)||data.connectorRuns.some(r=>r.projectId===id&&r.source===source))sources.add(source);
 return [...sources].map(source=>{
  const snapshots=data.metricSnapshots.filter(r=>r.projectId===id&&r.source===source);
  const dates=[...snapshots.map(r=>r.date),...(source==="admob"?data.admobMediationMetrics.filter(r=>r.projectId===id).map(r=>r.date):[]),...(source==="play_stats"?data.playInstallStats.filter(r=>r.projectId===id).map(r=>r.date):[]),...(source==="play_vitals"?data.playVitalsMetrics.filter(r=>r.projectId===id).map(r=>r.date):[]),...(source==="asc_analytics"?data.ascAnalyticsMetrics.filter(r=>r.projectId===id).map(r=>r.date):[]),...(source==="ga4_landing"?(data.ga4LandingMetrics??[]).filter(r=>r.projectId===id).map(r=>r.date):[]),...(source==="aso"?data.appKeywords.filter(r=>r.projectId===id).map(r=>r.date):[]),...(source==="pagespeed"||source==="crux"?(data.webPerformanceMetrics??[]).filter(r=>r.projectId===id&&r.source===source&&r.status==="available").map(r=>r.date):[]),...(data.seoGeoObservations??[]).filter(r=>r.projectId===id&&r.source===source).map(r=>r.windowEnd.slice(0,10))];
  const latest=latestDay(dates.map(date=>({date})));
  const run=data.connectorRuns.filter(r=>r.projectId===id&&r.source===source).sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt))[0];
  const lastSuccess=data.connectorRuns.filter(r=>r.projectId===id&&r.source===source&&r.status==="success").sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt))[0];
  const freshness=CONNECTOR_CATALOG[source].grain==="events"?lastSuccess?.finishedAt??latest:latest;
  const stale=freshness!==undefined&&(Date.now()-Date.parse(freshness))/86400000>CONNECTOR_CATALOG[source].staleAfterDays;
  return {source,label:CONNECTOR_CATALOG[source].label,latest,run:run?.finishedAt,status:run?.status??"never",stale,manualAudit:source==="pagespeed"||source==="crux"};
 });
}

/** Prefer useful measurements; a configured but empty source is still represented. */
export function availableMetrics(data:AppData,p:Project,specs:readonly MetricSpec[]){
 const configured=new Set(configuredSources(p));
 return specs.filter(s=>configured.has(s.source)||metricObservations(data,p.id,s).some(o=>o.value!==null&&Number.isFinite(o.value))||(s.kind==="ratio"&&data.metricSnapshots.some(r=>r.projectId===p.id&&r.source===s.source&&r.impressions!==undefined)));
}
export function overviewMetrics(data:AppData,p:Project,days:number){
 const web=[METRICS.clicks,METRICS.visitors,METRICS.adsense,METRICS.impressions,METRICS.sessions,METRICS.ctr,METRICS.position,METRICS.gaViews,METRICS.umamiViews,METRICS.gaUsers];
 const hasUserInstalls=metricObservations(data,p.id,METRICS.installs).some(o=>o.value!==null);
 const app=[METRICS.ads,METRICS.mrr,METRICS.downloads,METRICS.installs,...(!hasUserInstalls?[METRICS.deviceInstalls]:[]),METRICS.subscribers,METRICS.rating,METRICS.devices,...(hasUserInstalls?[METRICS.deviceInstalls]:[])];
 const order=p.type==="web"?web:p.type==="app"?app:[METRICS.clicks,METRICS.ads,METRICS.mrr,METRICS.downloads,METRICS.installs,...web,...app];
 const unique=[...new Map(order.map(s=>[s.source+":"+s.key,s])).values()];
 const models=availableMetrics(data,p,unique).map(s=>projectMetric(data,p.id,s,days));
 return [...models.filter(m=>m.result.value!==null),...models.filter(m=>m.result.value===null)];
}
export function needsAttention(s:ReturnType<typeof sourceRows>[number]){
 return s.stale||!s.latest||["failed","partial","no_data","never","skipped"].includes(s.status);
}
export function syncStatus(status:string){
 return ({success:"OK",partial:"Parziale",failed:"Errore",no_data:"Senza dati",skipped:"Saltata",never:"Mai aggiornata"} as Record<string,string>)[status]??status;
}
