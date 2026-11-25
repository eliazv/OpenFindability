"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {PanelsTopLeft,ChartNoAxesCombined,Search,Settings,SlidersHorizontal,PanelLeftClose,PanelLeftOpen} from "lucide-react";
import {Button} from "@/components/ui/button";
import {ProjectAvatar} from "@/components/analytics/project-avatar";
import type {SidebarProject} from "@/components/analytics/sidebar-editor";
import {Sidebar,SidebarContent,SidebarFooter,SidebarGroup,SidebarGroupContent,SidebarGroupLabel,SidebarHeader,SidebarMenu,SidebarMenuButton,SidebarMenuItem,SidebarRail,useSidebar} from "@/components/ui/sidebar";
const labelClass="min-w-0 truncate group-data-[collapsible=icon]:hidden";
export function AppSidebar({projects,onSearch,onSettings,onOrganize}:{projects:SidebarProject[];onSearch:()=>void;onSettings:()=>void;onOrganize:()=>void}){
 const pathname=usePathname(),{isMobile,state,toggleSidebar,setOpenMobile}=useSidebar(),collapsed=!isMobile&&state==="collapsed",CollapseIcon=collapsed?PanelLeftOpen:PanelLeftClose;
 const closeMobile=()=>{if(isMobile)setOpenMobile(false);};
 const visible=projects.filter(p=>!p.hidden),hidden=projects.length-visible.length;
 return <Sidebar collapsible="icon">
  <SidebarHeader className="gap-1">
   <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col"><SidebarMenu className="min-w-0 flex-1"><SidebarMenuItem><SidebarMenuButton asChild size="lg" isActive={pathname==="/"} tooltip="Panoramica" className="h-10"><Link href="/" onClick={closeMobile} aria-label="Panoramica"><ChartNoAxesCombined className="size-5!"/><span className={labelClass+" font-semibold"}>OpenFindability</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
   <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground group-data-[collapsible=icon]:size-9" onClick={toggleSidebar} aria-label={isMobile?"Chiudi navigazione":collapsed?"Espandi sidebar":"Comprimi sidebar"} title={isMobile?"Chiudi navigazione":collapsed?"Espandi sidebar (Ctrl+B)":"Comprimi sidebar (Ctrl+B)"}><CollapseIcon className="size-4"/></Button></div>
   <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Cerca (Ctrl+K)" onClick={onSearch} aria-label="Cerca in OpenFindability" className="h-9 border border-sidebar-border bg-background/60 text-muted-foreground group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent"><Search/><span className={labelClass+" flex-1"}>Cerca…</span><kbd className="text-[10px] rounded border px-1 py-0.5 group-data-[collapsible=icon]:hidden">Ctrl K</kbd></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
  </SidebarHeader>
  <SidebarContent>
   <SidebarGroup className="pt-1"><SidebarGroupLabel className="justify-between group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"><span className="group-data-[collapsible=icon]:hidden">Progetti</span><Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={onOrganize} aria-label="Organizza progetti" title="Organizza progetti"><SlidersHorizontal className="size-4"/></Button></SidebarGroupLabel>
   <SidebarGroupContent><SidebarMenu>{visible.map(p=>{const href="/project/"+p.slug;return <SidebarMenuItem key={p.id}><SidebarMenuButton asChild isActive={pathname===href||pathname.startsWith(href+"/")} tooltip={p.name} className="h-9"><Link href={href} onClick={closeMobile} aria-label={p.name} prefetch={false}><ProjectAvatar name={p.name} icon={p.icon} websiteUrl={p.websiteUrl} type={p.type} className="size-6"/><span className={labelClass}>{p.name}</span></Link></SidebarMenuButton></SidebarMenuItem>})}</SidebarMenu>{hidden>0&&<button type="button" onClick={onOrganize} className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden">{hidden} {hidden===1?"progetto nascosto":"progetti nascosti"}</button>}{!visible.length&&<p className="px-2 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Nessun progetto visibile.</p>}</SidebarGroupContent></SidebarGroup>
  </SidebarContent>
  <SidebarFooter className="border-t border-sidebar-border"><SidebarMenu>
   <SidebarMenuItem><SidebarMenuButton asChild tooltip="Store Studio"><a href="http://127.0.0.1:5177/" target="_blank" rel="noreferrer" aria-label="Store Studio"><PanelsTopLeft/><span className={labelClass}>Store Studio</span></a></SidebarMenuButton></SidebarMenuItem>
   <SidebarMenuItem><SidebarMenuButton isActive={pathname==="/tools"||pathname==="/data"} tooltip="Impostazioni" onClick={onSettings} aria-label="Impostazioni"><Settings/><span className={labelClass}>Impostazioni</span></SidebarMenuButton></SidebarMenuItem>
  </SidebarMenu></SidebarFooter><SidebarRail/>
 </Sidebar>;
}
