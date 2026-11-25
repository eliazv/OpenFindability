"use client";
import {useState,useEffect} from "react";
import {useRouter} from "next/navigation";
import {ArrowUp,ArrowDown,Eye,EyeOff,Star,RefreshCw} from "lucide-react";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle} from "@/components/ui/sheet";
import {Button} from "@/components/ui/button";
import {SortableList} from "@/components/ui/sortable-list";
import {ProjectAvatar} from "./project-avatar";
import {moveItem,type NavigationItem} from "@/lib/dashboard/navigation";
import type {ProjectType} from "@/lib/types";
export type SidebarProject=NavigationItem&{type:ProjectType;icon?:string;websiteUrl?:string};
export function SidebarEditor({projects,open,onOpenChange,onRestoreFocus}:{projects:SidebarProject[];open:boolean;onOpenChange:(open:boolean)=>void;onRestoreFocus:()=>void}){
 const router=useRouter(),[items,I]=useState(projects),[busy,B]=useState(false),[error,E]=useState(""),[refreshing,R]=useState(false),[artworkMessage,AM]=useState("");
 async function refreshArtwork(){R(true);AM("");try{const res=await fetch("/api/navigation/artwork",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({force:true})});const data=await res.json();if(!res.ok)throw new Error("HTTP "+res.status+" · "+(data.error??"Aggiornamento non riuscito"));const results=data.results as {status:string}[];AM(results.filter(r=>r.status==="updated").length+" icone aggiornate · "+results.filter(r=>r.status==="unavailable").length+" non disponibili");router.refresh();}catch(e){AM(e instanceof Error?e.message:"Aggiornamento non riuscito");}finally{R(false);}}
 function change(next:boolean){if(busy)return;onOpenChange(next);}
 useEffect(()=>{if(open){I(projects);E("");}},[open]);
 async function save(reset=false){
  B(true);E("");
  try{
   const response=await fetch("/api/navigation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reset,items:(reset?[...projects].sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,"it")):items).map(p=>({id:p.id,hidden:reset?null:p.hiddenOverride}))})});
   if(!response.ok)throw new Error("HTTP "+response.status+" · "+((await response.json()).error??"Salvataggio non riuscito"));
   onOpenChange(false);router.refresh();
  }catch(e){E(e instanceof Error?e.message:"Salvataggio non riuscito");}finally{B(false);}
 }
 return <Sheet open={open} onOpenChange={change}>
 <SheetContent side="right" onCloseAutoFocus={e=>{e.preventDefault();onRestoreFocus();}} className="flex flex-col gap-0 sm:max-w-lg w-full">
 <SheetHeader><SheetTitle>Organizza sidebar</SheetTitle><SheetDescription>{items.filter(p=>!p.hidden).length} visibili · {items.filter(p=>p.hidden).length} nascosti. I dati e le sincronizzazioni non cambiano.</SheetDescription></SheetHeader>
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2"><SortableList items={items} onChange={I} disabled={busy} renderItem={(p,i)=><> <ProjectAvatar name={p.name} icon={projects.find(x=>x.id===p.id)?.icon??p.icon} websiteUrl={p.websiteUrl} type={p.type}/>
 <span className={"min-w-0 flex-1 "+(p.hidden?"opacity-60":"")}><span className="block truncate text-sm">{p.name}</span>{p.archived&&<span className="text-xs text-muted-foreground">Archiviato</span>}</span>{p.favorite&&<Star className="size-3 text-amber-500"/>}
 <Button type="button" variant="ghost" size="icon" disabled={busy||i===0} onClick={()=>I(old=>moveItem(old,i,i-1))} className="size-7" aria-label={"Sposta su "+p.name}><ArrowUp className="size-4"/></Button>
 <Button type="button" variant="ghost" size="icon" disabled={busy||i===items.length-1} onClick={()=>I(old=>moveItem(old,i,i+1))} className="size-7" aria-label={"Sposta giù "+p.name}><ArrowDown className="size-4"/></Button>
 <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={()=>I(old=>old.map(x=>x.id===p.id?{...x,hidden:!x.hidden,hiddenOverride:!x.hidden}:x))} className="size-7" aria-label={(p.hidden?"Mostra ":"Nascondi ")+p.name} title={p.hidden?"Mostra":"Nascondi"}>{p.hidden?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</Button>
</>}/></div>
 <div className="border-t p-4 space-y-2"><div className="flex items-center justify-between gap-2"><button type="button" disabled={refreshing||busy} onClick={refreshArtwork} className="inline-flex gap-2 items-center text-xs hover:underline disabled:opacity-50"><RefreshCw className={"size-3 "+(refreshing?"animate-spin":"")}/>{refreshing?"Aggiornamento icone…":"Recupera icone dagli store"}</button><span role="status" className="text-xs text-muted-foreground">{artworkMessage}</span></div>{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}<div className="flex items-center justify-between gap-2"><button type="button" disabled={busy} onClick={()=>{I(old=>old.map(p=>({...p,hidden:false,hiddenOverride:false})));}} className="text-xs underline">Mostra tutti</button><div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>{if(window.confirm("Ripristinare ordine automatico e visibilità predefinita?"))void save(true);}} className="rounded border px-3 py-2 text-sm">Ripristina</button><button type="button" disabled={busy} onClick={()=>save()} className="rounded bg-primary text-primary-foreground px-3 py-2 text-sm">{busy?"Salvataggio…":"Salva"}</button></div></div></div>
 </SheetContent></Sheet>;
}
