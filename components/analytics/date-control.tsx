"use client";
import {useState} from "react";
import {usePathname,useSearchParams,useRouter} from "next/navigation";
import {CalendarDays} from "lucide-react";
import {parseDashboardPeriod,shiftDay} from "@/lib/dashboard/metrics";
export function DateControl({limited=false}:{limited?:boolean}){
 const router=useRouter(),path=usePathname(),params=useSearchParams(),state=parseDashboardPeriod(Object.fromEntries(params));
 const today=new Date().toISOString().slice(0,10),yesterday=shiftDay(today,-1);
 const [from,F]=useState(state.from??shiftDay(yesterday,-27)),[to,T]=useState(state.end??yesterday),[open,O]=useState(false);
 function apply(days:number,start?:string,end?:string,comparison?:string){const q=new URLSearchParams(params.toString());q.set("days",String(days));q.delete("from");q.delete("to");if(start&&end){q.set("from",start);q.set("to",end);}if(comparison)q.set("compare",comparison);for(const k of [...q.keys()])if(k.endsWith("_page"))q.delete(k);router.replace(path+"?"+q.toString(),{scroll:false});O(false);}
 const options=limited?[7,28,90]:[7,28,90,365];
 const valid=from<=to&&to<=today&&Math.round((Date.parse(to)-Date.parse(from))/86400000)+1<=365;
 return <div className="relative shrink-0 my-1.5"><button type="button" aria-expanded={open} onClick={()=>O(!open)} className="inline-flex items-center gap-2 rounded-md border bg-card px-3 h-9 text-sm"><CalendarDays className="size-4 text-muted-foreground"/>{state.from&&!limited?state.from+" – "+state.end:"Ultimi "+(limited?Math.min(state.days,90):state.days)+" giorni"}</button>
 {open&&<div className="absolute right-0 z-30 mt-1 w-[min(320px,85vw)] rounded-lg border bg-popover shadow-lg p-3 space-y-3"><div className="grid grid-cols-2 gap-2">{options.map(n=><button key={n} type="button" onClick={()=>apply(n)} className="rounded border px-2 py-1.5 text-xs hover:bg-muted">{n} giorni</button>)}{!limited&&<><button type="button" className="rounded border py-1.5 text-xs" onClick={()=>{const first=today.slice(0,7)+"-01";if(first<=yesterday)apply(28,first,yesterday);}}>Mese corrente</button><button type="button" className="rounded border py-1.5 text-xs" onClick={()=>{const end=shiftDay(today.slice(0,7)+"-01",-1);apply(28,end.slice(0,7)+"-01",end);}}>Mese precedente</button></>}</div>
 {!limited&&<><div className="grid grid-cols-2 gap-2"><label className="text-xs">Dal<input type="date" max={today} value={from} onChange={e=>F(e.target.value)} className="block w-full min-w-0 rounded border bg-background p-1 text-xs"/></label><label className="text-xs">Al<input type="date" max={today} value={to} onChange={e=>T(e.target.value)} className="block w-full min-w-0 rounded border bg-background p-1 text-xs"/></label></div><button type="button" disabled={!valid} onClick={()=>apply(28,from,to)} className="rounded border px-3 py-1.5 text-xs disabled:opacity-40">Applica date</button><label className="block text-xs">Confronta con<select className="ml-2 rounded border bg-background p-1" value={state.comparison} onChange={e=>apply(state.days,state.from,state.end,e.target.value)}><option value="previous">Periodo precedente</option><option value="year">52 settimane fa</option></select></label></>}
 <button type="button" className="text-xs text-muted-foreground underline" onClick={()=>O(false)}>Chiudi</button></div>}
 </div>;
}
