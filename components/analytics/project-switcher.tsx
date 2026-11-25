"use client";
import {useId,useMemo,useRef,useState,type KeyboardEvent} from "react";
import {useRouter} from "next/navigation";
import {ArrowRight,ChartNoAxesCombined,Database,Search,Wrench} from "lucide-react";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {ProjectAvatar} from "./project-avatar";
import {searchDestinations} from "@/lib/dashboard/navigation-search";
import type {SidebarProject} from "./sidebar-editor";
const groupNames={global:"Generale",projects:"Progetti",sections:"Sezioni progetto"};
export function ProjectSwitcher({projects,open,onOpenChange,onRestoreFocus}:{projects:SidebarProject[];open:boolean;onOpenChange:(open:boolean)=>void;onRestoreFocus:()=>void}){
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="gap-0 overflow-hidden p-0 max-w-xl" onCloseAutoFocus={e=>{e.preventDefault();onRestoreFocus();}}><DialogHeader className="sr-only"><DialogTitle>Cerca in OpenFindability</DialogTitle><DialogDescription>Cerca progetti, sezioni o strumenti. Usa le frecce per navigare.</DialogDescription></DialogHeader>
 <SearchResults projects={projects} close={()=>onOpenChange(false)}/>
 </DialogContent></Dialog>;
}
function SearchResults({projects,close}:{projects:SidebarProject[];close:()=>void}){
 const listId=useId(),router=useRouter(),[q,Q]=useState(""),[selected,S]=useState(0),input=useRef<HTMLInputElement>(null);
 const items=useMemo(()=>searchDestinations(projects,q),[projects,q]),bySlug=useMemo(()=>new Map(projects.map(p=>[p.slug,p])),[projects]);
 const active=Math.min(selected,Math.max(0,items.length-1));
 const refs=useRef<(HTMLButtonElement|null)[]>([]);
 function select(index:number){const item=items[index];if(!item)return;close();router.push(item.href);}
 function step(index:number){if(!items.length)return;const next=(index+items.length)%items.length;S(next);refs.current[next]?.scrollIntoView({block:"nearest"});}
 function keys(e:KeyboardEvent<HTMLInputElement>){if(e.nativeEvent.isComposing)return;if(e.key==="ArrowDown"){e.preventDefault();step(active+1);}else if(e.key==="ArrowUp"){e.preventDefault();step(active-1);}else if(e.key==="Enter"&&items.length){e.preventDefault();select(active);}}
 return <>
 <div className="flex items-center gap-3 border-b px-4 py-3 pr-12"><Search className="size-5 shrink-0 text-muted-foreground"/><Input ref={input} value={q} onChange={e=>{Q(e.target.value);S(0);}} onKeyDown={keys} autoFocus role="combobox" aria-expanded={true} aria-controls={listId} aria-activedescendant={items.length?listId+"-"+active:undefined} aria-autocomplete="list" aria-label="Cerca destinazione" placeholder="Cerca progetti, pagine e strumenti…" className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"/><kbd className="hidden sm:inline text-[10px] text-muted-foreground">ESC</kbd></div>
 <div className="max-h-[min(55vh,420px)] overflow-y-auto p-2" id={listId} role="listbox" aria-label="Risultati di ricerca">
 {(["global","projects","sections"] as const).map(group=>{const rows=items.map((item,index)=>({item,index})).filter(x=>x.item.group===group);if(!rows.length)return null;return <section key={group} role="group" aria-label={groupNames[group]} className="mb-2 last:mb-0"><p className="px-2 py-1 text-xs font-medium text-muted-foreground">{groupNames[group]}</p>{rows.map(({item,index})=>{const p=item.slug?bySlug.get(item.slug):undefined;const Icon=item.kind==="data"?Database:item.kind==="tools"?Wrench:ChartNoAxesCombined;return <button type="button" role="option" aria-selected={index===active} tabIndex={-1} id={listId+"-"+index} key={item.href} ref={node=>{refs.current[index]=node;}} onMouseEnter={()=>S(index)} onFocus={()=>S(index)} onClick={()=>select(index)} className={"flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring "+(index===active?"bg-accent text-accent-foreground":"hover:bg-muted")} >
 {p?<ProjectAvatar name={p.name} icon={p.icon} websiteUrl={p.websiteUrl} type={p.type} className="size-6"/>:<Icon className="size-4 mx-1 text-muted-foreground"/>}<span className="min-w-0 flex-1 truncate">{item.name}</span>{item.hidden&&<span className="text-[10px] text-muted-foreground">Nascosto</span>}{index===active&&<ArrowRight className="size-4 shrink-0 opacity-60"/>}</button>})}</section>})}
 {!items.length&&<p role="status" className="p-6 text-center text-sm text-muted-foreground">Nessun risultato.</p>}
 </div><div className="flex flex-wrap gap-4 border-t px-4 py-2 text-xs text-muted-foreground"><span>↑ ↓ Naviga</span><span>Invio per aprire</span><span>Esc per chiudere</span></div>
 </>;
}
