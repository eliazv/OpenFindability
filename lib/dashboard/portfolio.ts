import type {AppData} from "@/lib/types";
import {configuredSources,metricObservations,projectMetric,type MetricSpec} from "./read-model";
import {latestDay,dayRange} from "./metrics";
/** Use a common end date and one currency per total; exclude incomplete projects explicitly. */
export function portfolioMetric(data:AppData,spec:MetricSpec,days:number,endOverride?:string){
 const eligible=data.projects.filter(p=>configuredSources(p).includes(spec.source)||metricObservations(data,p.id,spec).some(o=>o.value!==null));
 const endpoints=eligible.map(p=>latestDay(metricObservations(data,p.id,spec).filter(o=>o.value!==null))).filter((d):d is string=>!!d).sort();
 // Do not let a disconnected/stale project shift the complete portfolio into the past.
 const end=endOverride??endpoints.at(-1),groups=new Map<string,{value:number;count:number;previous:number;compared:number}>();
 const excluded:string[]=[];
 if(end)for(const p of eligible){
  const {result:m}=projectMetric(data,p.id,spec,days,end);
  const complete=spec.kind==="snapshot"?m.points.at(-1)?.current!=null:m.observed===m.expected;
  if(!complete||m.value===null||(spec.unit==="currency"&&!m.currency)){excluded.push(p.name);continue;}
  const key=m.currency??"",g=groups.get(key)??{value:0,count:0,previous:0,compared:0};
  g.value+=m.value;g.count++;if(m.delta!==null&&m.previous!==null){g.previous+=m.previous;g.compared++;}groups.set(key,g);
 }
 return {label:spec.label,unit:spec.unit,range:end?dayRange(end,days):null,eligible:eligible.length,excluded:end?excluded:eligible.map(p=>p.name),groups:[...groups].map(([currency,g])=>({currency:currency||undefined,value:g.value,count:g.count,deltaPercent:g.compared===g.count&&g.previous!==0?(g.value-g.previous)/Math.abs(g.previous)*100:null}))};
}
