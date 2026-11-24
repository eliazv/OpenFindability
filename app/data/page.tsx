import {readData} from "@/lib/store";
import {getDoctorReport} from "@/lib/doctor";
import {sourceRows} from "@/lib/dashboard/read-model";
import {Explorer,type Params} from "@/components/analytics/explorer";
import {SyncButton} from "@/components/sync-button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import Link from "next/link";
export default async function DataPage({searchParams}:{searchParams:Promise<Params>}){
 const query=await searchParams,data=await readData(),doctor=await getDoctorReport();
 return <main className="p-4 lg:p-7 space-y-5 min-w-0 w-full"><header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold">Centro dati</h1><p className="text-sm text-muted-foreground">Copertura, aggiornamenti e verifiche locali.</p></div><SyncButton/></header>
 <Explorer title="Stato integrazioni" columns={["Progetto","Fonte","Ultimo dato","Ultimo sync","Stato"]} rows={data.projects.flatMap(p=>sourceRows(data,p).map(s=>({id:p.id+":"+s.source,cells:[p.name,s.label,s.latest,s.run,s.status+(s.stale?" · dato in ritardo":"")]})))} params={query} scope="sources" note="La data del dato e quella del sync sono distinte."/>
 <Card><CardHeader><CardTitle>Doctor</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 gap-2">{doctor.checks.map((c,i)=><div key={i} className="rounded-md border p-3"><div className="text-sm font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.status?"OK":c.required?"Errore":"Da verificare"}</div></div>)}<p className="text-xs text-muted-foreground">Per il dettaglio diagnostico eseguire pnpm doctor localmente.</p></CardContent></Card>
 <Explorer title="Registro operazioni" columns={["Progetto","Fonte","Inizio","Fine","Stato"]} rows={[...data.connectorRuns].sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt)).map(r=>({id:r.id,cells:[data.projects.find(p=>p.id===r.projectId)?.name??"Globale",r.source,r.startedAt,r.finishedAt,r.status]}))} params={query} scope="runs"/>
 <div className="flex gap-3 flex-wrap">{data.projects.map(p=><Link key={p.id} className="text-sm underline" href={"/project/"+p.slug+"/settings"}>{p.name}: integrazioni</Link>)}</div></main>;
}
