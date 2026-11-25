"use client";
import {useEffect,useState} from "react";
import {SourceIcon} from "./source-icon";
type Progress={project:string|null;source:string|null;completed:number;total:number;started:string};
export function SyncProgress(){
 const [progress,setProgress]=useState<Progress|null>(null);
 useEffect(()=>{let live=true;async function poll(){if(document.hidden)return;try{const r=await fetch("/api/sync",{cache:"no-store"});if(r.ok){const p=await r.json();if(live)setProgress(p.progress??null);}}catch{}}void poll();const timer=setInterval(poll,2500);return()=>{live=false;clearInterval(timer);};},[]);
 if(!progress)return null;
 const percent=progress.total?Math.round(100*progress.completed/progress.total):0;
 return <div role="status" className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"><span className="flex items-center gap-2 min-w-0">{progress.source&&<SourceIcon source={progress.source}/>}<span className="truncate">{progress.project??"Preparazione"} · {progress.source??"Sync"}</span></span><progress aria-label="Sincronizzazione" max={100} value={percent} className="flex-1 h-2 accent-primary"/><span className="text-xs tabular-nums">{progress.completed}/{progress.total}</span></div>;
}
