import {SettingsBack} from "@/components/analytics/settings-back";
import {runDetails} from "@/lib/dashboard/run-display";
import {BackupPanel} from "@/components/analytics/backup-panel";
import {listBackups} from "@/lib/db/backup";
import {db} from "@/lib/db/client";
import {qualityRows} from "@/lib/analytics/data-quality";
import {readDashboardData} from "@/lib/store";
import {getLatestGscIndexInspections} from "@/lib/insights";
import {getLatestSyncProblems} from "@/lib/doctor";
import {sourceRows,needsAttention,syncStatus} from "@/lib/dashboard/read-model";
import {Explorer,type Params} from "@/components/analytics/explorer";
import {Disclosure} from "@/components/analytics/disclosure";
import {SyncTracker} from "@/components/analytics/sync-tracker";
import {SyncButton} from "@/components/sync-button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
export default async function DataPage({searchParams}:{searchParams:Promise<Params>}){
 const query=await searchParams,data=await readDashboardData("data"),problems=getLatestSyncProblems(data);
 const coverage=qualityRows(db,data.projects);
 const backups=await listBackups();
 const index=getLatestGscIndexInspections(data);
 const bySite=new Map<string,{total:number;problems:number;critical:number;indexed:number}>();
 for(const row of index){const group=bySite.get(row.siteUrl)??{total:0,problems:0,critical:0,indexed:0};group.total++;if(row.severity!=="none")group.problems++;if(row.severity==="high")group.critical++;if(row.issueCode==="indexed")group.indexed++;bySite.set(row.siteUrl,group);}
 const rows=data.projects.flatMap(p=>sourceRows(data,p).map(s=>({...s,project:p.name,slug:p.slug,id:p.id+":"+s.source}))).sort((a,b)=>Number(needsAttention(b))-Number(needsAttention(a)));
 return <div className="p-4 lg:p-7 space-y-5 min-w-0 w-full"><header className="flex flex-wrap justify-between gap-3"><div><SettingsBack/><h1 className="text-2xl font-semibold">Centro dati</h1></div><SyncButton/></header>
 <Explorer title="Stato integrazioni" columns={["Progetto","Fonte","Ultimo dato","Ultimo sync","Stato"]} rows={rows.map(s=>({id:s.id,source:s.source,sourceColumn:1,href:"/project/"+s.slug+"/settings",cells:[s.project,s.label,s.latest,s.run,syncStatus(s.status)+(s.stale?" · in ritardo":"")]}))} params={query} scope="sources"/>
 {bySite.size>0&&<Disclosure title="Indicizzazione Google" count={bySite.size} open={Object.keys(query).some(k=>k.startsWith("index_"))}><Explorer title="Proprietà ispezionate" columns={["Proprietà","URL ispezionati","Indicizzati","Problemi","Critici"]} rows={[...bySite.entries()].sort((a,b)=>b[1].critical-a[1].critical||b[1].problems-a[1].problems).map(([site,g])=>({id:site,cells:[site,g.total,g.indexed,g.problems,g.critical]}))} scope="index" params={query}/></Disclosure>}
 {coverage.length>0&&<Explorer title="Copertura ultimi 30 giorni disponibili" columns={["Progetto","Fonte","Giorni con righe","Attesi","Giorni mancanti","Ultimo giorno atteso","Date mancanti"]} rows={coverage.map(c=>({id:c.project+":"+c.source,source:c.source,sourceColumn:1,cells:[c.project,c.source,c.observed,c.expected,c.missing.length,c.end,c.missing.join(", ")]}))} visibleColumns={[0,1,2,3,4]} params={query} scope="coverage"/>}
 <BackupPanel backups={backups}/>
 <SyncTracker data={data}/><Disclosure title="Diagnostica"> <Card><CardHeader><CardTitle>Doctor · diagnostica locale</CardTitle></CardHeader><CardContent className="space-y-2"><p className="text-sm">{problems.length?`${problems.length} problemi nelle ultime sincronizzazioni configurate`:"Nessun problema registrato nelle ultime sincronizzazioni configurate."}</p><p className="text-xs text-muted-foreground">Per verificare anche credenziali, cache e raggiungibilità dei servizi, eseguire esplicitamente <code>pnpm doctor</code>. Questa pagina non effettua richieste ai provider.</p></CardContent></Card></Disclosure>
 <Disclosure title="Registro operazioni" count={data.connectorRuns.length} open={Object.keys(query).some(k=>k.startsWith("runs_"))}><Explorer title="Registro operazioni" columns={["Progetto","Fonte","Inizio","Fine","Stato","Durata (s)","Messaggio","Righe importate"]} rows={[...data.connectorRuns].sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt)).map(r=>({id:r.id,source:r.source,sourceColumn:1,cells:[data.projects.find(p=>p.id===r.projectId)?.name??"Globale",r.source,r.startedAt,r.finishedAt,syncStatus(r.status),runDetails(r).duration,runDetails(r).message,runDetails(r).counts]}))} params={query} scope="runs" visibleColumns={[0,1,3,4,5]}/></Disclosure>
 </div>;
}
