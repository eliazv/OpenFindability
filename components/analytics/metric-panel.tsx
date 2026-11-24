import Link from "next/link";
import { MetricCard,MetricSeries } from "./metric-card";
import { queryHref,type Params } from "./explorer";
import type { projectMetric } from "@/lib/dashboard/read-model";
type Model=ReturnType<typeof projectMetric>;
export function MetricPanel({models,params,scope="metric",annotations=[],limit=4}:{models:Model[];params:Params;scope?:string;annotations?:{date:string;title:string}[];limit?:number}){
 if(!models.length)return <p className="rounded-lg border p-4 text-sm text-muted-foreground">Nessuna fonte configurata o dato disponibile.</p>;
 const key=(m:Model)=>m.spec.source+":"+m.spec.key;
 const ordered=[...models.filter(m=>m.result.value!==null),...models.filter(m=>m.result.value===null)];
 const main=ordered.find(m=>key(m)===params[scope])??ordered[0];
 const primary=ordered.slice(0,limit),secondary=ordered.slice(limit);
 if(!primary.includes(main)){primary[primary.length-1]=main;secondary.splice(secondary.indexOf(main),1);secondary.unshift(ordered[limit-1]);}
 const tile=(m:Model)=><Link key={key(m)} href={queryHref(params,{[scope]:key(m)})} aria-current={key(m)===key(main)?"true":undefined} className={"block min-w-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring "+(key(m)===key(main)?"ring-2 ring-primary":"hover:ring-1 hover:ring-border")}><MetricCard {...m}/></Link>;
 return <div className="space-y-3"><div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">{primary.map(tile)}</div>
 <MetricSeries {...main} annotations={annotations}/>
 {secondary.length>0&&<details className="rounded-lg border px-3 py-2" open={secondary.some(m=>key(m)===key(main))||undefined}><summary className="cursor-pointer text-sm text-muted-foreground">Altre metriche ({secondary.length})</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{secondary.map(tile)}</div></details>}
 </div>;
}
