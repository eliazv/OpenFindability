"use client";
import Link from "next/link";
import {useEffect,useRef} from "react";
import {usePathname,useSearchParams,useRouter} from "next/navigation";
import type {ProjectType} from "@/lib/types";
import {parseDays} from "@/lib/dashboard/metrics";
import {CalendarDays} from "lucide-react";
export function ProjectTabs({slug,type}:{slug:string;type:ProjectType}){
 const path=usePathname(),params=useSearchParams(),router=useRouter();
 const nav=useRef<HTMLElement>(null);
 useEffect(()=>{const active=nav.current?.querySelector<HTMLElement>('[aria-current="page"]');if(active&&nav.current){const left=active.offsetLeft-nav.current.offsetLeft,right=left+active.offsetWidth;if(left<nav.current.scrollLeft||right>nav.current.scrollLeft+nav.current.clientWidth)nav.current.scrollLeft=Math.max(0,left-12);}},[path]);
 const base="/project/"+slug,section=path===base?"":path.slice(base.length+1),days=parseDays(params.get("days")??undefined);
 const options=section==="interventions"?[7,28,90]:[7,28,90,365];
 const periodVisible=!["opportunities","settings"].includes(section);
 const tabs=[["","Panoramica"],["acquisition","Acquisizione"],...(type==="web"?[]:[["store","Store"]]),["revenue","Ricavi"],["health","Salute"],["opportunities","Opportunità"],["interventions","Interventi"],["settings","Integrazioni"]];
 return <div className="mt-3 flex flex-wrap items-center gap-x-3 border-b">
 <nav ref={nav} aria-label="Sezioni progetto" className="flex flex-1 basis-full sm:basis-auto min-w-0 gap-1 overflow-x-auto [scrollbar-width:thin]">{tabs.map(([segment,label])=>{const href=base+(segment?"/"+segment:"");return <Link key={segment} href={href+(days!==28?"?days="+days:"")} prefetch={false} aria-current={path===href?"page":undefined} className={"shrink-0 whitespace-nowrap px-3 py-2.5 text-sm border-b-2 "+(path===href?"border-primary font-medium":"border-transparent text-muted-foreground hover:text-foreground")}>{label}</Link>})}</nav>
 {periodVisible&&<label className="inline-flex shrink-0 items-center gap-2 my-1.5 rounded-md border bg-card pl-2 pr-1 text-xs"><CalendarDays className="size-4 text-muted-foreground"/><span className="sr-only">Periodo</span><select aria-label="Periodo" className="h-8 bg-transparent pr-1 text-sm" value={Math.min(days,Math.max(...options))} onChange={e=>{const q=new URLSearchParams(params.toString());q.set("days",e.target.value);for(const k of [...q.keys()])if(k.endsWith("_page"))q.delete(k);router.replace(path+"?"+q.toString(),{scroll:false});}}>{options.map(n=><option key={n} value={n} className="bg-card">Ultimi {n} giorni</option>)}</select></label>}
 </div>;
}
