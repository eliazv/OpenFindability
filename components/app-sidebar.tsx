"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, LayoutDashboard, Wrench } from "lucide-react";

import { ProjectAvatar } from "@/components/analytics/project-avatar";
import type { Project } from "@/lib/types";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";


export function AppSidebar({ projects }: { projects: (Pick<Project, "id" | "slug" | "name" | "type"> & {icon?:string})[] }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" isActive={pathname === "/"} tooltip="OpenFindability">
              <Link href="/">
                <LayoutDashboard />
                <span className="text-sm font-bold uppercase tracking-wide">OpenFindability</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Progetti</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => {
                const href = `/project/${project.slug}`;
                return (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton asChild isActive={pathname === href || pathname.startsWith(href + "/")} tooltip={project.name}>
                      <Link href={href}>
                        <ProjectAvatar name={project.name} icon={project.icon}/>
                        <span>{project.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/tools"} tooltip="Strumenti"><Link href="/tools"><Wrench /><span>Strumenti</span></Link></SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/data"} tooltip="Centro dati"><Link href="/data"><Database /><span>Centro dati</span></Link></SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
