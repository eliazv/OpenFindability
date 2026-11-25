"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {RefreshCw} from "lucide-react";
export function RefreshProjectIcon({slug}:{slug:string}){
 const router=useRouter(),[busy,B]=useState(false),[message,M]=useState("");
 async function run(){B(true);M("");try{const r=await fetch("/api/navigation/artwork",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({slug})}),d=await r.json();if(!r.ok)throw new Error("HTTP "+r.status+" · "+(d.error??"Aggiornamento non riuscito"));M(d.results?.[0]?.status==="updated"?"Icona aggiornata":d.results?.[0]?.status==="cached"?"Icona già disponibile":"Icona non disponibile");router.refresh();}catch(e){M(e instanceof Error?e.message:"Aggiornamento non riuscito");}finally{B(false);}}
 return <div className="flex items-center gap-2"><button type="button" disabled={busy} onClick={run} className="inline-flex gap-2 items-center rounded border px-3 py-2 text-xs"><RefreshCw className={"size-3 "+(busy?"animate-spin":"")}/>Aggiorna icona progetto</button>{message&&<span role="status" className="text-xs text-muted-foreground">{message}</span>}</div>;
}
