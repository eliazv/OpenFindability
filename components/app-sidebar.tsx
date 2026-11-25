"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Database,LayoutDashboard,Wrench,PanelsTopLeft,ChartNoAxesCombined} from "lucide-react";
import {ProjectAvatar} from "@/components/analytics/project-avatar";
import type {Project} from "@/lib/types";
import {Sidebar,SidebarContent,SidebarFooter,SidebarGroup,SidebarGroupContent,SidebarGroupLabel,SidebarHeader,SidebarMenu,SidebarMenuButton,SidebarMenuItem,SidebarRail} from "@/components/ui/sidebar";
type NavProject=Pick<Project,"id"|"slug"|"name"|"type"> & {icon?:string;websiteUrl?:string};
const labelClass="min-w-0 truncate group-data-[collapsible=icon]:hidden";
export function AppSidebar({projects}:{projects:NavProject[]}){
 const pathname=usePathname();
 return <Sidebar collapsible="icon">
  <SidebarHeader><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild size="lg" isActive={pathname==="/"} tooltip="Panoramica"><Link href="/" aria-label="Panoramica"><ChartNoAxesCombined className="size-5!"/><span className={labelClass+" font-semibold"}>OpenFindability</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarHeader>
  <SidebarContent>
   <SidebarGroup><SidebarGroupLabel>Progetti</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{projects.map(p=>{const href="/project/"+p.slug;return <SidebarMenuItem key={p.id}><SidebarMenuButton asChild isActive={pathname===href||pathname.startsWith(href+"/")} tooltip={p.name} className="h-10"><Link href={href} aria-label={p.name} prefetch={false}><ProjectAvatar name={p.name} icon={p.icon} websiteUrl={p.websiteUrl} type={p.type} className="size-6"/><span className={labelClass}>{p.name}</span></Link></SidebarMenuButton></SidebarMenuItem>})}</SidebarMenu></SidebarGroupContent></SidebarGroup>
  </SidebarContent>
  <SidebarFooter><SidebarMenu>
   <SidebarMenuItem><SidebarMenuButton asChild tooltip="Store Studio"><a href="http://127.0.0.1:5177/" target="_blank" rel="noreferrer" aria-label="Store Studio"><PanelsTopLeft/><span className={labelClass}>Store Studio</span></a></SidebarMenuButton></SidebarMenuItem>
   <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname==="/tools"} tooltip="Strumenti"><Link href="/tools" aria-label="Strumenti"><Wrench/><span className={labelClass}>Strumenti</span></Link></SidebarMenuButton></SidebarMenuItem>
   <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname==="/data"} tooltip="Centro dati"><Link href="/data" aria-label="Centro dati"><Database/><span className={labelClass}>Centro dati</span></Link></SidebarMenuButton></SidebarMenuItem>
  </SidebarMenu></SidebarFooter><SidebarRail/>
 </Sidebar>;
}
