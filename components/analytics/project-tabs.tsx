"use client";
import Link from "next/link";
import {useEffect,useRef} from "react";
import {usePathname,useSearchParams} from "next/navigation";
import type {ProjectType} from "@/lib/types";
import {parseDashboardPeriod} from "@/lib/dashboard/metrics";
import {projectSections} from "@/lib/dashboard/navigation-search";
import {DateControl} from "./date-control";

export function ProjectTabs({slug,type}:{slug:string;type:ProjectType}){
 const path=usePathname(),params=useSearchParams();
 const nav=useRef<HTMLElement>(null);
 useEffect(()=>{const active=nav.current?.querySelector<HTMLElement>('[aria-current="page"]');if(active&&nav.current){const left=active.offsetLeft-nav.current.offsetLeft,right=left+active.offsetWidth;if(left<nav.current.scrollLeft||right>nav.current.scrollLeft+nav.current.clientWidth)nav.current.scrollLeft=Math.max(0,left-12);}},[path]);
 const base="/project/"+slug,section=path===base?"":path.slice(base.length+1),period=parseDashboardPeriod(Object.fromEntries(params));
 const days=period.days;

 const periodVisible=!["opportunities","settings"].includes(section);
 const tabs=projectSections(type);
 return <div className="mt-3 flex flex-wrap items-center gap-x-3 border-b">
 <nav ref={nav} aria-label="Sezioni progetto" className="flex flex-1 basis-full sm:basis-auto min-w-0 gap-1 overflow-x-auto [scrollbar-width:thin]">{tabs.map(([segment,label])=>{const href=base+(segment?"/"+segment:"");return <Link key={segment} href={href+"?"+new URLSearchParams({days:String(period.from?28:days),...(period.from&&segment!=="interventions"?{from:period.from,to:period.end!}:{}),compare:period.comparison}).toString()} prefetch={false} aria-current={path===href?"page":undefined} className={"shrink-0 whitespace-nowrap px-3 py-2.5 text-sm border-b-2 "+(path===href?"border-primary font-medium":"border-transparent text-muted-foreground hover:text-foreground")}>{label}</Link>})}</nav>
 {periodVisible&&<DateControl limited={section==="interventions"}/>}
 </div>;
}
