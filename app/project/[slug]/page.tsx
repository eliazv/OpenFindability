import Link from "next/link";
import { notFound } from "next/navigation";
import { readDashboardData } from "@/lib/store";
import { METRICS,projectMetric,openOpportunities,sourceRows } from "@/lib/dashboard/read-model";
import { parseDays } from "@/lib/dashboard/metrics";
import { MetricCard,MetricSeries } from "@/components/analytics/metric-card";
import { Explorer,PeriodPicker,queryHref,type Params } from "@/components/analytics/explorer";
export default async function ProjectPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Params>}){
 const [{slug},query]=await Promise.all([params,searchParams]);const data=await readDashboardData("overview",slug),p=data.projects.find(p=>p.slug===slug);if(!p)notFound();
 const days=parseDays(query.days),specs=p.type==="web"?[METRICS.clicks,METRICS.impressions,METRICS.ctr,METRICS.position]:p.type==="app"?[METRICS.downloads,METRICS.installs,METRICS.mrr,METRICS.ads]:[METRICS.clicks,METRICS.downloads,METRICS.mrr,METRICS.ads];
 const cards=specs.map(s=>projectMetric(data,p.id,s,days));const main=cards.find(c=>c.spec.source+":"+c.spec.key===query.metric)??cards.find(c=>c.result.observed>0)??cards[0];
 const opp=openOpportunities(data,p.id);
 return <div className="space-y-5"><div className="flex flex-wrap justify-between items-center gap-2"><h2 className="text-lg font-semibold">Panoramica</h2><PeriodPicker params={query}/></div>
 <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{cards.map(c=><div key={c.spec.key+":"+c.spec.source} className="space-y-1"><MetricCard {...c}/><Link className="text-xs underline" href={queryHref(query,{metric:c.spec.source+":"+c.spec.key})}>Mostra andamento</Link></div>)}</div><MetricSeries {...main} annotations={(data.projectInterventions??[]).filter(r=>r.projectId===p.id).map(r=>({date:r.date,title:r.title}))}/>
 <div className="grid gap-4 lg:grid-cols-2"><Explorer title="Priorità aperte" columns={["Opportunità","Score"]} rows={opp.slice(0,5).map(o=>({id:o.id,cells:[o.title,o.score]}))} params={query} note="Prime cinque per score."/><Explorer title="Stato fonti" columns={["Fonte","Ultimo dato","Sync"]} rows={sourceRows(data,p).map(s=>({id:s.source,cells:[s.label,s.latest,s.status+(s.stale?" · dato in ritardo":"")]}))} params={query} scope="sources"/></div>
 <div className="flex flex-wrap gap-4 text-sm"><Link className="underline" href={"/project/"+slug+"/opportunities"}>Tutte le opportunità ({opp.length})</Link><Link className="underline" href={"/project/"+slug+"/settings"}>Integrazioni</Link>{p.type!=="web"&&<a className="underline" href={"http://127.0.0.1:5177/?project="+encodeURIComponent(slug)} target="_blank" rel="noreferrer">Store Studio</a>}</div></div>;
}
