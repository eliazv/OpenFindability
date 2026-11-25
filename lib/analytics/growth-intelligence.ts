import type {AppData,Project} from "@/lib/types";
import {METRICS,availableMetrics,projectMetric,openOpportunities,sourceRows,type MetricSpec} from "@/lib/dashboard/read-model";
import {portfolioMetric} from "@/lib/dashboard/portfolio";
import {formatMetric,shiftDay} from "@/lib/dashboard/metrics";
export const growthSpecs=[METRICS.clicks,METRICS.impressions,METRICS.ctr,METRICS.position,METRICS.visitors,METRICS.sessions,METRICS.gaViews,METRICS.gaEvents,METRICS.downloads,METRICS.installs,METRICS.uninstalls,METRICS.devices,METRICS.ads,METRICS.adsense,METRICS.mrr,METRICS.subscribers,METRICS.rollingRevenue,METRICS.rating,METRICS.crash,METRICS.anr];
const signals:{spec:MetricSpec;min:number;pct:number;absolute?:number}[]=[
 {spec:METRICS.clicks,min:50,pct:20},{spec:METRICS.visitors,min:100,pct:20},{spec:METRICS.sessions,min:100,pct:20},
 {spec:METRICS.downloads,min:20,pct:25},{spec:METRICS.installs,min:20,pct:25},{spec:METRICS.uninstalls,min:10,pct:30},
 {spec:METRICS.ads,min:5,pct:25},{spec:METRICS.adsense,min:5,pct:25},{spec:METRICS.mrr,min:5,pct:20},{spec:METRICS.subscribers,min:10,pct:20},
 {spec:METRICS.ctr,min:0,pct:20,absolute:.5},{spec:METRICS.position,min:1,pct:15,absolute:2},
];
export function growthSignals(data:AppData,days=28,end?:string,comparison:"previous"|"year"="previous"){
 return data.projects.flatMap(p=>signals.flatMap(({spec,min,pct,absolute})=>{
  const {result:m}=projectMetric(data,p.id,spec,days,end,comparison);
  if(m.value===null||m.previous===null||m.delta===null||m.deltaPercent===null||Math.max(m.value,m.previous)<min||Math.abs(m.deltaPercent)<pct||absolute!==undefined&&Math.abs(m.delta)<absolute)return [];
  if(spec.kind==="ratio"){const impressions=projectMetric(data,p.id,METRICS.impressions,days,end,comparison).result;if(impressions.observed!==impressions.expected||impressions.previousObserved!==impressions.expected||Math.min(impressions.value??0,impressions.previous??0)<500)return [];}
  const improved=spec.lowerBetter?m.delta<0:m.delta>0;
  return [{id:p.id+":"+spec.source+":"+spec.key,project:p.name,slug:p.slug,source:spec.source,metric:spec.label,key:spec.key,value:m.value,previous:m.previous,delta:m.delta,percent:m.deltaPercent,unit:spec.unit,currency:m.currency,improved,range:m.range,comparison,score:Math.min(100,Math.abs(m.deltaPercent)),label:formatMetric(m.value,spec.unit,m.currency,spec.precision)}];
 })).sort((a,b)=>Number(a.improved)-Number(b.improved)||b.score-a.score);
}
export function projectAnalytics(data:AppData,p:Project,days=28){
 return {project:{slug:p.slug,name:p.name},metrics:availableMetrics(data,p,growthSpecs).map(spec=>{const {result,...m}=projectMetric(data,p.id,spec,days);const {points,...summary}=result;return {...m,result:summary};}),sources:sourceRows(data,p),signals:growthSignals({...data,projects:[p]},days),opportunities:openOpportunities(data,p.id).map(({rawJson,...o})=>o)};
}
export function portfolioAnalytics(data:AppData,days=28){return {totals:[METRICS.ads,METRICS.adsense,METRICS.mrr,METRICS.clicks,METRICS.downloads,METRICS.installs,METRICS.visitors].map(s=>portfolioMetric(data,s,days)).filter(t=>t.eligible),projects:data.projects.map(p=>projectAnalytics(data,p,days)),signals:growthSignals(data,days)};}
export function advertisingBreakdown(rows:AppData["admobMediationMetrics"],by:"format"|"source"="format"){
 const groups=new Map<string,{name:string;currency:string;revenue:number;impressions:number;requests:number;matched:number;missingRevenue:boolean;missingImpressions:boolean;missingRequests:boolean}>();
 for(const r of rows){if(!r.currency||!/^[A-Z]{3}$/.test(r.currency))continue;const name=by==="format"?r.format??"Non specificato":r.adSourceName,key=JSON.stringify([r.currency,name]);const g=groups.get(key)??{name,currency:r.currency,revenue:0,impressions:0,requests:0,matched:0,missingRevenue:false,missingImpressions:false,missingRequests:false};if(r.estimatedEarnings==null)g.missingRevenue=true;else g.revenue+=r.estimatedEarnings;if(r.impressions==null)g.missingImpressions=true;else g.impressions+=r.impressions;if(r.adRequests==null||r.matchedRequests==null)g.missingRequests=true;else{g.requests+=r.adRequests;g.matched+=r.matchedRequests;}groups.set(key,g);}
 return [...groups.values()].map(g=>({name:g.name,currency:g.currency,revenue:g.missingRevenue?null:g.revenue,impressions:g.missingImpressions?null:g.impressions,ecpm:!g.missingRevenue&&!g.missingImpressions&&g.impressions>0?1000*g.revenue/g.impressions:null,matchRate:!g.missingRequests&&g.requests>0?100*g.matched/g.requests:null})).sort((a,b)=>a.currency.localeCompare(b.currency)||(b.revenue??-1)-(a.revenue??-1));
}

export function asoMovers(data:AppData,projectId:string,end:string,days:number){
 const from=shiftDay(end,1-days),groups=new Map<string,AppData["asoAppRankSnapshots"]>();
 for(const r of data.asoAppRankSnapshots.filter(r=>r.projectId===projectId&&r.date<=end)){const key=JSON.stringify([r.keyword,r.country]),g=groups.get(key)??[];g.push(r);groups.set(key,g);}
 return [...groups.values()].flatMap(rows=>{rows.sort((a,b)=>b.date.localeCompare(a.date)||b.observedAt.localeCompare(a.observedAt));const latest=rows[0],prior=rows.find(r=>r.date<from);if(!prior||latest.date<from||latest.appRank==null||prior.appRank==null||latest.appRank<=0||prior.appRank<=0)return [];return [{keyword:latest.keyword,country:latest.country,rank:latest.appRank,previous:prior.appRank,delta:prior.appRank-latest.appRank,date:latest.date,previousDate:prior.date}];}).filter(r=>r.delta!==0).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
}
export function releaseImpact(data:AppData,projectId:string,date:string,days=28){
 const before=shiftDay(date,-1),after=shiftDay(date,days);
 return [METRICS.downloads,METRICS.installs,METRICS.uninstalls,METRICS.devices,METRICS.ads,METRICS.mrr,METRICS.subscribers,METRICS.crash,METRICS.anr].flatMap(spec=>{
  const b=projectMetric(data,projectId,spec,days,before).result,a=projectMetric(data,projectId,spec,days,after).result;
  if(b.value===null&&a.value===null)return [];
  const complete=(m:typeof b)=>"kind" in spec&&spec.kind==="snapshot"?m.points.at(-1)?.current!=null:m.observed===m.expected;
  const comparable=complete(a)&&complete(b)&&a.value!==null&&b.value!==null&&a.currency===b.currency;
  return [{source:spec.source,metric:spec.label,before:b.value,after:a.value,delta:comparable?a.value!-b.value!:null,currency:a.currency,unit:spec.unit,coverageBefore:b.observed,coverageAfter:a.observed,expected:days,comparable}];
 });
}
