import {readDashboardData} from "@/lib/store";
import {getLatestSyncProblems} from "@/lib/doctor";
import {sourceRows} from "@/lib/dashboard/read-model";
import {Explorer,type Params} from "@/components/analytics/explorer";
import {SyncTracker} from "@/components/analytics/sync-tracker";
import {SyncButton} from "@/components/sync-button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import Link from "next/link";
export default async function DataPage({searchParams}:{searchParams:Promise<Params>}){
 const query=await searchParams,data=await readDashboardData("data"),problems=getLatestSyncProblems(data);
 return <div className="p-4 lg:p-7 space-y-5 min-w-0 w-full"><header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold">Centro dati</h1><p className="text-sm text-muted-foreground">Copertura, aggiornamenti e verifiche locali.</p></div><SyncButton/></header>
 <Explorer title="Stato integrazioni" columns={["Progetto","Fonte","Ultimo dato","Ultimo sync","Stato"]} rows={data.projects.flatMap(p=>sourceRows(data,p).map(s=>({id:p.id+":"+s.source,cells:[p.name,s.label,s.latest,s.run,s.status+(s.stale?" · dato in ritardo":"")]})))} params={query} scope="sources" note="La data del dato e quella del sync sono distinte."/>
 <SyncTracker data={data}/><Card><CardHeader><CardTitle>Doctor · diagnostica locale</CardTitle></CardHeader><CardContent className="space-y-2"><p className="text-sm">{problems.length?`${problems.length} problemi nelle ultime sincronizzazioni configurate`:"Nessun problema registrato nelle ultime sincronizzazioni configurate."}</p><p className="text-xs text-muted-foreground">Per verificare anche credenziali, cache e raggiungibilità dei servizi, eseguire esplicitamente <code>pnpm doctor</code>. Questa pagina non effettua richieste ai provider.</p></CardContent></Card>
 <Explorer title="Registro operazioni" columns={["Progetto","Fonte","Inizio","Fine","Stato"]} rows={[...data.connectorRuns].sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt)).map(r=>({id:r.id,cells:[data.projects.find(p=>p.id===r.projectId)?.name??"Globale",r.source,r.startedAt,r.finishedAt,r.status]}))} params={query} scope="runs"/>
 <div className="flex gap-3 flex-wrap">{data.projects.map(p=><Link key={p.id} className="text-sm underline" href={"/project/"+p.slug+"/settings"}>{p.name}: integrazioni</Link>)}</div></div>;
}
