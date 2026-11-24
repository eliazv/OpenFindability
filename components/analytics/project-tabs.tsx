"use client";
import Link from "next/link";
import { usePathname,useSearchParams } from "next/navigation";
import type { ProjectType } from "@/lib/types";
export function ProjectTabs({slug,type}:{slug:string;type:ProjectType}){
 const path=usePathname(),params=useSearchParams(),days=params.get("days");
 const tabs=[["","Panoramica"],["acquisition","Acquisizione"],...(type==="web"?[]:[["store","Store"]]),["revenue","Ricavi"],["health","Salute"],["opportunities","Opportunità"],["interventions","Interventi"],["settings","Integrazioni"]];
 return <nav aria-label="Sezioni progetto" className="mt-4 flex gap-1 overflow-x-auto border-b">{tabs.map(([segment,label])=>{const href="/project/"+slug+(segment?"/"+segment:"");return <Link key={segment} href={href+(days?"?days="+encodeURIComponent(days):"")} aria-current={path===href?"page":undefined} className={"shrink-0 px-3 py-2 text-sm border-b-2 "+(path===href?"border-primary font-medium":"border-transparent text-muted-foreground hover:text-foreground")}>{label}</Link>})}</nav>;
}
