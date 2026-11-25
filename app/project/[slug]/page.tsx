import Link from "next/link";
import { notFound } from "next/navigation";
import { readDashboardData } from "@/lib/store";
import { overviewMetrics,openOpportunities,sourceRows,needsAttention,syncStatus } from "@/lib/dashboard/read-model";
import { parseDays } from "@/lib/dashboard/metrics";
import { MetricPanel } from "@/components/analytics/metric-panel";
import { type Params } from "@/components/analytics/explorer";
import { Card,CardHeader,CardTitle,CardContent } from "@/components/ui/card";

export default async function ProjectPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Params>}){
 const [{slug},query]=await Promise.all([params,searchParams]);
 const data=await readDashboardData("overview",slug),p=data.projects.find(p=>p.slug===slug);if(!p)notFound();
 const days=parseDays(query.days),cards=overviewMetrics(data,p,days),opp=openOpportunities(data,p.id);
 const issues=sourceRows(data,p).filter(needsAttention);
 const link=(section:string)=>"/project/"+slug+"/"+section+"?days="+days;
 return <div className="space-y-4">

 <MetricPanel models={cards} params={query} annotations={(data.projectInterventions??[]).filter(r=>r.projectId===p.id).map(r=>({date:r.date,title:r.title}))}/>
 <div className="grid gap-3 lg:grid-cols-2">
 <Card className="gap-3 py-4"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Opportunità ({opp.length})</CardTitle><Link className="text-xs underline" href={link("opportunities")}>Vedi tutte</Link></CardHeader><CardContent>{opp.length?<ul className="divide-y">{opp.slice(0,5).map(o=><li key={o.id} className="py-2 flex items-start justify-between gap-3 text-sm"><span>{o.title}</span><span className={"shrink-0 text-xs "+(o.severity==="high"?"text-destructive":"text-muted-foreground")}>{o.severity==="high"?"Alta":o.severity==="medium"?"Media":"Bassa"}</span></li>)}</ul>:<p className="text-sm text-muted-foreground">Nessuna opportunità aperta.</p>}</CardContent></Card>
 <Card className="gap-3 py-4"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Fonti da verificare ({issues.length})</CardTitle><Link className="text-xs underline" href={link("settings")}>Integrazioni</Link></CardHeader><CardContent>{issues.length?<ul className="divide-y">{issues.slice(0,5).map(s=><li key={s.source} className="py-2 flex justify-between gap-3 text-sm"><span>{s.label}</span><span className="text-xs text-muted-foreground">{s.stale?"Dati in ritardo":!s.latest?"Nessun dato":syncStatus(s.status)}</span></li>)}</ul>:<p className="text-sm text-muted-foreground">{sourceRows(data,p).length?"Nessun problema rilevato.":"Nessuna fonte configurata."}</p>}</CardContent></Card>
 </div></div>;
}
