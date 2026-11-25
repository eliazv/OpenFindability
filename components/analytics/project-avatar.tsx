"use client";
import {useState} from "react";
import {Globe,Smartphone,Layers} from "lucide-react";
import {cn} from "@/lib/utils";
import type {ProjectType} from "@/lib/types";
import {faviconCandidates} from "@/lib/dashboard/favicon";
export function ProjectAvatar({name,icon,websiteUrl,type,className}:{name:string;icon?:string;websiteUrl?:string;type?:ProjectType;className?:string}){
 const candidates=[...new Set([icon,...faviconCandidates(websiteUrl)].filter((x):x is string=>!!x))];
 const key=candidates.join("|");
 return <AvatarImage key={key} name={name} candidates={candidates} type={type} className={className}/>;
}
function AvatarImage({name,candidates,type,className}:{name:string;candidates:string[];type?:ProjectType;className?:string}){
 const [index,setIndex]=useState(0);
 const Icon=type==="app"?Smartphone:type==="web_app"?Layers:Globe;
 return <span aria-hidden="true" title={name} className={cn("inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sidebar-accent text-sidebar-accent-foreground",className)}>{candidates[index]?<img src={candidates[index]} alt="" referrerPolicy="no-referrer" decoding="async" className="size-full object-contain" onError={()=>setIndex(i=>i+1)}/>:<Icon className="size-4"/>}</span>;
}
