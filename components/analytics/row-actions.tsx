"use client";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle,SheetTrigger} from "@/components/ui/sheet";
import type {Row,Cell} from "./explorer";
import {csvText} from "@/lib/dashboard/csv";
export function RowDetail({columns,row}:{columns:string[];row:Row}){
 return <Sheet><SheetTrigger asChild><button type="button" className="text-xs underline">Dettaglio</button></SheetTrigger><SheetContent className="w-full sm:max-w-lg overflow-y-auto"><SheetHeader><SheetTitle>Dettaglio riga</SheetTitle><SheetDescription>Valori della vista corrente</SheetDescription></SheetHeader><dl className="px-4 pb-4 space-y-3">{columns.map((c,i)=><div key={i}><dt className="text-xs text-muted-foreground">{c}</dt><dd className="text-sm break-words">{row.cells[i]??"—"}</dd></div>)}</dl></SheetContent></Sheet>;
}
export function CsvButton({title,columns,rows}:{title:string;columns:string[];rows:Row[]}){
 function download(){const blob=new Blob(["\ufeff",csvText(columns,rows.map(r=>r.cells))],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=title.replace(/[^a-z0-9]+/gi,"-")+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <button className="h-9 rounded-md border px-3 text-xs" type="button" onClick={download} disabled={!rows.length}>CSV pagina</button>;
}
