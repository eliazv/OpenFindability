import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {shiftDay} from "@/lib/dashboard/metrics";
import type {AppData} from "@/lib/types";
const statusColors:Record<string,string>={success:"bg-success",partial:"bg-warning",failed:"bg-destructive",no_data:"bg-muted-foreground",skipped:"bg-muted",never:"bg-muted border"};
const labels:Record<string,string>={success:"Successo",partial:"Parziale",failed:"Errore",no_data:"Senza dati",skipped:"Saltato",never:"Nessuna esecuzione"};
export function SyncTracker({data}:{data:Pick<AppData,"connectorRuns"|"projects">}){
 const today=new Date().toISOString().slice(0,10),days=Array.from({length:14},(_,i)=>shiftDay(today,i-13));
 const by=new Map<string,{label:string;points:Map<string,{status:string;at:string}>}>();
 for(const r of data.connectorRuns){const date=r.finishedAt.slice(0,10);if(date<days[0]||date>today)continue;
  const key=(r.projectId??"global")+":"+r.source,label=(data.projects.find(p=>p.id===r.projectId)?.name??"Globale")+" · "+r.source;
  const item=by.get(key)??{label,points:new Map()};const prev=item.points.get(date);if(!prev||prev.at<r.finishedAt)item.points.set(date,{status:r.status,at:r.finishedAt});by.set(key,item);
 }
 return <Card><CardHeader><CardTitle>Registro visivo · 14 giorni UTC</CardTitle><p className="text-xs text-muted-foreground">Ultimo esito del giorno, non copertura dei dati. Celle vuote = nessuna esecuzione.</p></CardHeader><CardContent className="space-y-3"><div className="overflow-x-auto"><table className="min-w-[620px] w-full text-xs"><thead><tr><th className="text-left">Progetto / fonte</th>{days.map(d=><th key={d} className="font-normal text-muted-foreground">{d.slice(8)}</th>)}</tr></thead><tbody>{[...by.entries()].sort((a,b)=>a[1].label.localeCompare(b[1].label)).map(([key,row])=><tr key={key}><td className="py-1 pr-2">{row.label}</td>{days.map(d=>{const s=row.points.get(d)?.status??"never";return <td key={d} className="p-0.5"><span title={d+" · "+labels[s]} className={"block rounded-sm h-5 min-w-3 "+(statusColors[s]??"bg-muted")}><span className="sr-only">{labels[s]}</span></span></td>})}</tr>)}</tbody></table></div>{!by.size&&<p className="text-sm text-muted-foreground">Nessuna esecuzione negli ultimi 14 giorni.</p>}<div className="flex flex-wrap gap-3">{Object.entries(labels).map(([s,label])=><span key={s} className="text-xs flex gap-1 items-center"><span className={"inline-block size-3 rounded-sm "+statusColors[s]}/>{label}</span>)}</div></CardContent></Card>;
}
