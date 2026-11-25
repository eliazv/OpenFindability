"use client";
import {useSearchParams} from "next/navigation";
import {MetricCard,MetricSeries} from "./metric-card";
import type {Params} from "./explorer";
import type {projectMetric} from "@/lib/dashboard/read-model";
type Model=ReturnType<typeof projectMetric>;
export function MetricPanel({models,params,scope="metric",annotations=[]}:{models:Model[];params:Params;scope?:string;annotations?:{date:string;title:string}[]}){
 const search=useSearchParams();
 const key=(m:Model)=>m.spec.source+":"+m.spec.key;
 const visible=models.filter(m=>m.result.value!==null||m.result.observed>0||m.result.warning);
 if(!visible.length)return <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">Nessun dato nel periodo.</p>;
 const main=visible.find(m=>key(m)===(search.get(scope)??params[scope]))??visible[0];
 function select(m:Model){
  const q=new URLSearchParams(window.location.search);q.set(scope,key(m));
  window.history.replaceState(null,"",window.location.pathname+"?"+q.toString()+window.location.hash);
 }
 return <div className="space-y-3">
  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-4">{visible.map(m=><button type="button" key={key(m)} aria-pressed={key(m)===key(main)} onClick={()=>select(m)} className={"text-left min-w-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring "+(key(m)===key(main)?"ring-1 ring-primary":"hover:ring-1 hover:ring-border")}><MetricCard {...m}/></button>)}</div>
  <MetricSeries {...main} annotations={annotations}/>
 </div>;
}
