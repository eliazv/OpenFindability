"use client";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle,SheetTrigger} from "@/components/ui/sheet";
import {ChevronRight,Download} from "lucide-react";
import type {Row} from "./explorer";
import {csvText} from "@/lib/dashboard/csv";
export function RowDetail({columns,row}:{columns:string[];row:Row}){
 return <Sheet><SheetTrigger asChild><button type="button" aria-label="Dettaglio riga" title="Dettaglio" className="inline-flex size-7 items-center justify-center rounded hover:bg-muted text-muted-foreground"><ChevronRight className="size-4"/></button></SheetTrigger><SheetContent className="w-full sm:max-w-lg overflow-y-auto"><SheetHeader><SheetTitle>Dettaglio riga</SheetTitle><SheetDescription className="sr-only">Valori della riga selezionata</SheetDescription></SheetHeader><dl className="px-4 pb-4 space-y-3">{columns.map((c,i)=><div key={i}><dt className="text-xs text-muted-foreground">{c}</dt><dd className="text-sm break-words">{row.cells[i]??"—"}</dd></div>)}</dl></SheetContent></Sheet>;
}
export function CsvButton({title,columns,rows}:{title:string;columns:string[];rows:Row[]}){
 function download(){const blob=new Blob(["\ufeff",csvText(columns,rows.map(r=>r.cells))],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=title.replace(/[^a-z0-9]+/gi,"-")+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <button className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted disabled:opacity-40" type="button" title="Esporta risultati CSV" aria-label="Esporta risultati CSV" onClick={download} disabled={!rows.length}><Download className="size-4"/></button>;
}
