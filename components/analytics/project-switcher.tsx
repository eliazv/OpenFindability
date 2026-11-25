"use client";
import {useState,useEffect} from "react";
import Link from "next/link";
import {Search} from "lucide-react";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle,SheetTrigger} from "@/components/ui/sheet";
type ProjectItem={slug:string;name:string;hidden?:boolean};
export function ProjectSwitcher({projects}:{projects:ProjectItem[]}){
 const [open,setOpen]=useState(false),[q,setQ]=useState("");
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setOpen(x=>!x);}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[]);
 const items=[{name:"Panoramica",href:"/"},{name:"Strumenti",href:"/tools"},{name:"Centro dati",href:"/data"},...projects.filter(p=>!p.hidden||q.trim()).flatMap(p=>[{name:p.name+(p.hidden?" · nascosto":""),href:"/project/"+p.slug},...["acquisition","revenue","opportunities","interventions","settings"].map((section,i)=>({name:p.name+" · "+["Acquisizione","Ricavi","Opportunità","Interventi","Integrazioni"][i],href:"/project/"+p.slug+"/"+section}))])].filter(p=>p.name.toLocaleLowerCase("it").includes(q.toLocaleLowerCase("it")));
 return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button type="button" className="flex items-center gap-2 text-xs text-muted-foreground border rounded-md px-2 py-1.5"><Search className="size-4"/><span className="hidden sm:inline">Cerca progetto o strumento</span><kbd className="hidden md:inline">Ctrl K</kbd></button></SheetTrigger><SheetContent side="top" className="mx-auto max-w-xl rounded-b-xl"><SheetHeader><SheetTitle>Vai a…</SheetTitle><SheetDescription>Progetti e strumenti della dashboard</SheetDescription></SheetHeader><div className="px-4 pb-4"><input className="border rounded-md w-full p-2 text-sm" aria-label="Cerca destinazione" value={q} onChange={e=>setQ(e.target.value)} placeholder="Nome progetto o strumento" autoFocus/><nav className="max-h-[50vh] overflow-auto mt-2">{items.map(p=><Link key={p.href} href={p.href} prefetch={false} onClick={()=>{setOpen(false);setQ("");}} className="block rounded-md px-3 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{p.name}</Link>)}{!items.length&&<p className="p-2 text-xs text-muted-foreground">Nessun risultato.</p>}</nav></div></SheetContent></Sheet>;
}
