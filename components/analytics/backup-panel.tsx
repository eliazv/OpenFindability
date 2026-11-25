"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {DatabaseBackup} from "lucide-react";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
export function BackupPanel({backups}:{backups:{name:string;size:number;modified:string}[]}){
 const router=useRouter(),[busy,B]=useState(false),[message,M]=useState("");
 async function run(){B(true);M("");try{const res=await fetch("/api/backup",{method:"POST"}),data=await res.json();if(!res.ok)throw new Error(data.error);M("Backup verificato.");router.refresh();}catch(e){M(e instanceof Error?e.message:"Backup non riuscito.");}finally{B(false);}}
 return <Card className="gap-2 py-3"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Backup locali</CardTitle><button disabled={busy} type="button" onClick={run} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-xs"><DatabaseBackup className="size-4"/>{busy?"Backup in corso":"Crea backup"}</button></CardHeader><CardContent>{backups.length?<><p className="text-sm">Ultimo: {backups[0].modified.slice(0,10)} · {(backups[0].size/1024/1024).toFixed(1)} MB</p><details className="text-xs mt-2"><summary>Ultimi backup</summary>{backups.map(b=><p className="break-all py-1" key={b.name}>{b.name} · {(b.size/1024/1024).toFixed(1)} MB</p>)}</details></>:<p className="text-sm text-muted-foreground">Nessun backup trovato.</p>}{message&&<p role="status" className="text-xs mt-2">{message}</p>}</CardContent></Card>;
}
