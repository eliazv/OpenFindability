"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Database,Wrench,PanelsTopLeft,ChartNoAxesCombined} from "lucide-react";
import {ProjectAvatar} from "@/components/analytics/project-avatar";
import {SidebarEditor,type SidebarProject} from "@/components/analytics/sidebar-editor";
import {Sidebar,SidebarContent,SidebarFooter,SidebarGroup,SidebarGroupContent,SidebarGroupLabel,SidebarHeader,SidebarMenu,SidebarMenuButton,SidebarMenuItem,SidebarRail} from "@/components/ui/sidebar";
const labelClass="min-w-0 truncate group-data-[collapsible=icon]:hidden";
export function AppSidebar({projects}:{projects:SidebarProject[]}){
 const pathname=usePathname();
 return <Sidebar collapsible="icon">
  <SidebarHeader><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild size="lg" isActive={pathname==="/"} tooltip="Panoramica"><Link href="/" aria-label="Panoramica"><ChartNoAxesCombined className="size-5!"/><span className={labelClass+" font-semibold"}>OpenFindability</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarHeader>
  <SidebarContent>
   <SidebarGroup><SidebarGroupLabel className="justify-between"><span>Progetti</span><SidebarEditor projects={projects}/></SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{projects.filter(p=>!p.hidden).map(p=>{const href="/project/"+p.slug;return <SidebarMenuItem key={p.id}><SidebarMenuButton asChild isActive={pathname===href||pathname.startsWith(href+"/")} tooltip={p.name} className="h-10"><Link href={href} aria-label={p.name} prefetch={false}><ProjectAvatar name={p.name} icon={p.icon} websiteUrl={p.websiteUrl} type={p.type} className="size-6"/><span className={labelClass}>{p.name}</span></Link></SidebarMenuButton></SidebarMenuItem>})}</SidebarMenu>{projects.some(p=>p.hidden)&&<p className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{projects.filter(p=>p.hidden).length} nascosti</p>}</SidebarGroupContent></SidebarGroup>
  </SidebarContent>
  <SidebarFooter><SidebarMenu>
   <SidebarMenuItem><SidebarMenuButton asChild tooltip="Store Studio"><a href="http://127.0.0.1:5177/" target="_blank" rel="noreferrer" aria-label="Store Studio"><PanelsTopLeft/><span className={labelClass}>Store Studio</span></a></SidebarMenuButton></SidebarMenuItem>
   <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname==="/tools"} tooltip="Strumenti"><Link href="/tools" aria-label="Strumenti"><Wrench/><span className={labelClass}>Strumenti</span></Link></SidebarMenuButton></SidebarMenuItem>
   <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname==="/data"} tooltip="Centro dati"><Link href="/data" aria-label="Centro dati"><Database/><span className={labelClass}>Centro dati</span></Link></SidebarMenuButton></SidebarMenuItem>
  </SidebarMenu></SidebarFooter><SidebarRail/>
 </Sidebar>;
}
