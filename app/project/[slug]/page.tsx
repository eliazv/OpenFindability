import {db} from "@/lib/db/client";
import {readPreferences,orderModels,goalProgress} from "@/lib/dashboard/preferences";
import {formatMetric} from "@/lib/dashboard/metrics";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readDashboardData } from "@/lib/store";
import { overviewMetrics,openOpportunities,sourceRows,needsAttention,syncStatus } from "@/lib/dashboard/read-model";
import { parseDashboardPeriod } from "@/lib/dashboard/metrics";
import { MetricPanel } from "@/components/analytics/metric-panel";
import { type Params } from "@/components/analytics/explorer";
import { Card,CardHeader,CardTitle,CardContent } from "@/components/ui/card";

export default async function ProjectPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Params>}){
 const [{slug},query]=await Promise.all([params,searchParams]);
 const data=await readDashboardData("overview",slug),p=data.projects.find(p=>p.slug===slug);if(!p)notFound();
 const period=parseDashboardPeriod(query),days=period.days,prefs=readPreferences(db,p.id)[0],cards=orderModels(overviewMetrics(data,p,days,period.end,period.comparison,prefs?.primaryMetrics),prefs),opp=openOpportunities(data,p.id);
 const goal=goalProgress(data,p,prefs);
 const issues=sourceRows(data,p).filter(needsAttention);
 const link=(section:string)=>"/project/"+slug+"/"+section+"?"+new URLSearchParams({days:String(period.from?28:days),...(period.from?{from:period.from,to:period.end!}:{}),compare:period.comparison}).toString();
 return <div className="space-y-4">

 <MetricPanel models={cards} params={query} annotations={(data.projectInterventions??[]).filter(r=>r.projectId===p.id).map(r=>({date:r.date,title:r.title}))}/>
 {goal&&<Card className="gap-2 py-3"><CardHeader><CardTitle className="text-base">Obiettivo · {goal.label}</CardTitle></CardHeader><CardContent><div className="flex items-center justify-between gap-2"><span className="text-xl font-semibold">{formatMetric(goal.value,goal.unit,goal.currency)} / {formatMetric(goal.target,goal.unit,goal.currency)}</span><span className="text-xs text-muted-foreground">{goal.kind==="snapshot"?"Ultima misura":"Ultimi 28 giorni"}</span></div>{goal.value!==null&&<progress max={goal.target} value={Math.max(0,Math.min(goal.target,goal.value))} className="w-full accent-primary h-2" aria-label="Avanzamento obiettivo"/>}</CardContent></Card>}
 <div className="grid gap-3 lg:grid-cols-2">
 <Card className="gap-3 py-4"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Opportunità ({opp.length})</CardTitle><Link className="text-xs underline" href={link("opportunities")}>Vedi tutte</Link></CardHeader><CardContent>{opp.length?<ul className="divide-y">{opp.slice(0,5).map(o=><li key={o.id} className="py-2 flex items-start justify-between gap-3 text-sm"><span>{o.title}</span><span className={"shrink-0 text-xs "+(o.severity==="high"?"text-destructive":"text-muted-foreground")}>{o.severity==="high"?"Alta":o.severity==="medium"?"Media":"Bassa"}</span></li>)}</ul>:<p className="text-sm text-muted-foreground">Nessuna opportunità aperta.</p>}</CardContent></Card>
 <Card className="gap-3 py-4"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Fonti da verificare ({issues.length})</CardTitle><Link className="text-xs underline" href={link("settings")}>Integrazioni</Link></CardHeader><CardContent>{issues.length?<ul className="divide-y">{issues.slice(0,5).map(s=><li key={s.source} className="py-2 flex justify-between gap-3 text-sm"><span>{s.label}</span><span className="text-xs text-muted-foreground">{s.stale?"Dati in ritardo":!s.latest?"Nessun dato":syncStatus(s.status)}</span></li>)}</ul>:<p className="text-sm text-muted-foreground">{sourceRows(data,p).length?"Nessun problema rilevato.":"Nessuna fonte configurata."}</p>}</CardContent></Card>
 </div></div>;
}
