import {readDashboardData} from "@/lib/store";
import {getLatestSyncProblems} from "@/lib/doctor";
import {sourceRows,needsAttention,syncStatus} from "@/lib/dashboard/read-model";
import {Explorer,type Params} from "@/components/analytics/explorer";
import {Disclosure} from "@/components/analytics/disclosure";
import {SyncTracker} from "@/components/analytics/sync-tracker";
import {SyncButton} from "@/components/sync-button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
export default async function DataPage({searchParams}:{searchParams:Promise<Params>}){
 const query=await searchParams,data=await readDashboardData("data"),problems=getLatestSyncProblems(data);
 const rows=data.projects.flatMap(p=>sourceRows(data,p).map(s=>({...s,project:p.name,id:p.id+":"+s.source}))).sort((a,b)=>Number(needsAttention(b))-Number(needsAttention(a)));
 return <div className="p-4 lg:p-7 space-y-5 min-w-0 w-full"><header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold">Centro dati</h1></div><SyncButton/></header>
 <Explorer title="Stato integrazioni" columns={["Progetto","Fonte","Ultimo dato","Ultimo sync","Stato"]} rows={rows.map(s=>({id:s.id,cells:[s.project,s.label,s.latest,s.run,syncStatus(s.status)+(s.stale?" · in ritardo":"")]}))} params={query} scope="sources"/>
 <SyncTracker data={data}/><Disclosure title="Diagnostica"> <Card><CardHeader><CardTitle>Doctor · diagnostica locale</CardTitle></CardHeader><CardContent className="space-y-2"><p className="text-sm">{problems.length?`${problems.length} problemi nelle ultime sincronizzazioni configurate`:"Nessun problema registrato nelle ultime sincronizzazioni configurate."}</p><p className="text-xs text-muted-foreground">Per verificare anche credenziali, cache e raggiungibilità dei servizi, eseguire esplicitamente <code>pnpm doctor</code>. Questa pagina non effettua richieste ai provider.</p></CardContent></Card></Disclosure>
 <Disclosure title="Registro operazioni" count={data.connectorRuns.length} open={Object.keys(query).some(k=>k.startsWith("runs_"))}><Explorer title="Registro operazioni" columns={["Progetto","Fonte","Inizio","Fine","Stato"]} rows={[...data.connectorRuns].sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt)).map(r=>({id:r.id,cells:[data.projects.find(p=>p.id===r.projectId)?.name??"Globale",r.source,r.startedAt,r.finishedAt,syncStatus(r.status)]}))} params={query} scope="runs"/></Disclosure>
 </div>;
}
