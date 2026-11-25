"use client";
import {useState,useRef} from "react";
import {useRouter} from "next/navigation";
import {ArrowUp,ArrowDown,Eye,EyeOff,GripVertical,Settings2,Star} from "lucide-react";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle,SheetTrigger} from "@/components/ui/sheet";
import {ProjectAvatar} from "./project-avatar";
import {moveItem,type NavigationItem} from "@/lib/dashboard/navigation";
import type {ProjectType} from "@/lib/types";
export type SidebarProject=NavigationItem&{type:ProjectType;icon?:string;websiteUrl?:string};
export function SidebarEditor({projects}:{projects:SidebarProject[]}){
 const router=useRouter(),[open,O]=useState(false),[items,I]=useState(projects),[busy,B]=useState(false),[error,E]=useState("");
 const dragging=useRef<string|null>(null);
 function change(open:boolean){if(busy)return;if(open){I(projects);E("");}O(open);}
 async function save(reset=false){
  B(true);E("");
  try{
   const response=await fetch("/api/navigation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:(reset?[...projects].sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,"it")):items).map(p=>({id:p.id,hidden:reset?null:p.hidden}))})});
   if(!response.ok)throw new Error((await response.json()).error??"Salvataggio non riuscito");
   O(false);router.refresh();
  }catch(e){E(e instanceof Error?e.message:"Salvataggio non riuscito");}finally{B(false);}
 }
 return <Sheet open={open} onOpenChange={change}><SheetTrigger asChild><button type="button" className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Organizza sidebar" title="Organizza sidebar"><Settings2 className="size-4"/></button></SheetTrigger>
 <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg w-full">
 <SheetHeader><SheetTitle>Organizza sidebar</SheetTitle><SheetDescription>{items.filter(p=>!p.hidden).length} visibili · {items.filter(p=>p.hidden).length} nascosti. I dati e le sincronizzazioni non cambiano.</SheetDescription></SheetHeader>
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2"><div className="divide-y rounded-md border">{items.map((p,i)=><div key={p.id} className={"flex items-center gap-2 px-2 py-2 "+(p.hidden?"opacity-60":"")} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";}} onDrop={e=>{e.preventDefault();const id=dragging.current;dragging.current=null;if(id)I(old=>moveItem(old,old.findIndex(x=>x.id===id),old.findIndex(x=>x.id===p.id)));}}>
 <span draggable={!busy} onDragStart={e=>{dragging.current=p.id;e.dataTransfer.setData("text/plain",p.id);e.dataTransfer.effectAllowed="move";}} onDragEnd={()=>{dragging.current=null;}} className="cursor-grab touch-none text-muted-foreground" title="Trascina per riordinare"><GripVertical className="size-4"/></span>
 <ProjectAvatar name={p.name} icon={p.icon} websiteUrl={p.websiteUrl} type={p.type}/>
 <span className="min-w-0 flex-1"><span className="block truncate text-sm">{p.name}</span>{p.archived&&<span className="text-xs text-muted-foreground">Archiviato</span>}</span>{p.favorite&&<Star className="size-3 text-amber-500"/>}
 <button type="button" disabled={busy||i===0} onClick={()=>I(old=>moveItem(old,i,i-1))} className="p-1 rounded hover:bg-muted disabled:opacity-25" aria-label={"Sposta su "+p.name}><ArrowUp className="size-4"/></button>
 <button type="button" disabled={busy||i===items.length-1} onClick={()=>I(old=>moveItem(old,i,i+1))} className="p-1 rounded hover:bg-muted disabled:opacity-25" aria-label={"Sposta giù "+p.name}><ArrowDown className="size-4"/></button>
 <button type="button" disabled={busy} onClick={()=>I(old=>old.map(x=>x.id===p.id?{...x,hidden:!x.hidden}:x))} className="p-1 rounded hover:bg-muted" aria-label={(p.hidden?"Mostra ":"Nascondi ")+p.name} title={p.hidden?"Mostra":"Nascondi"}>{p.hidden?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</button>
 </div>)}</div></div>
 <div className="border-t p-4 space-y-2">{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}<div className="flex items-center justify-between gap-2"><button type="button" disabled={busy} onClick={()=>{I(old=>old.map(p=>({...p,hidden:false})));}} className="text-xs underline">Mostra tutti</button><div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>save(true)} className="rounded border px-3 py-2 text-sm">Ripristina</button><button type="button" disabled={busy} onClick={()=>save()} className="rounded bg-primary text-primary-foreground px-3 py-2 text-sm">{busy?"Salvataggio…":"Salva"}</button></div></div></div>
 </SheetContent></Sheet>;
}
