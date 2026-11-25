"use client";
import {Database,Wrench,ArrowUpRight,SlidersHorizontal,ChevronRight} from "lucide-react";
import {useRouter} from "next/navigation";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Separator} from "@/components/ui/separator";
import {ThemeSettings} from "./theme-toggle";
export function DashboardSettings({open,onOpenChange,initialDark,onOrganize,onRestoreFocus}:{open:boolean;onOpenChange:(open:boolean)=>void;initialDark:boolean;onOrganize:()=>void;onRestoreFocus:()=>void}){
 const router=useRouter();
 function navigate(href:string){onOpenChange(false);router.push(href);}
 const itemClass="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring outline-none";
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent onCloseAutoFocus={e=>{e.preventDefault();onRestoreFocus();}} className="max-w-[480px] gap-4 max-h-[90dvh] overflow-y-auto">
 <DialogHeader><DialogTitle>Impostazioni</DialogTitle><DialogDescription>Preferenze e gestione di OpenFindability.</DialogDescription></DialogHeader>
 <section className="space-y-2"><h3 className="text-xs font-medium text-muted-foreground">Aspetto</h3><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">Tema</span><ThemeSettings initialDark={initialDark}/></div></section>
 <Separator/>
 <section><h3 className="mb-1 text-xs font-medium text-muted-foreground">Navigazione</h3>
 <button type="button" onClick={onOrganize} className={itemClass}><SlidersHorizontal className="size-5 shrink-0 text-muted-foreground"/><span className="flex-1 min-w-0"><span className="block text-sm font-medium">Organizza progetti</span><span className="block text-xs text-muted-foreground">Ordine, visibilità e icone</span></span><ChevronRight className="size-4 text-muted-foreground"/></button></section>
 <Separator/>
 <section><h3 className="mb-1 text-xs font-medium text-muted-foreground">Gestione</h3>
 <button type="button" onClick={()=>navigate("/data")} className={itemClass}><Database className="size-5 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Centro dati</span><span className="block text-xs text-muted-foreground">Integrazioni, sincronizzazioni e backup</span></span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground"/></button>
 <button type="button" onClick={()=>navigate("/tools")} className={itemClass}><Wrench className="size-5 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Strumenti</span><span className="block text-xs text-muted-foreground">Audit, report e comandi locali</span></span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground"/></button></section>
 </DialogContent></Dialog>;
}
