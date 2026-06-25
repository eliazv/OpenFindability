"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, Layers, LayoutDashboard, RefreshCw, Smartphone, Stethoscope } from "lucide-react";

import type { Project, ProjectType } from "@/lib/types";
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

const projectTypeIcon: Record<ProjectType, typeof Globe> = {
  web: Globe,
  app: Smartphone,
  web_app: Layers,
};

export function AppSidebar({ projects }: { projects: Project[] }) {
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
                const Icon = projectTypeIcon[project.type];
                const href = `/project/${project.slug}`;
                return (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton asChild isActive={pathname === href} tooltip={project.name}>
                      <Link href={href}>
                        <Icon />
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
            <SidebarMenuButton asChild tooltip="Doctor">
              <a href="/api/doctor">
                <Stethoscope />
                <span>Doctor</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Sync manuale">
              <a href="/api/sync">
                <RefreshCw />
                <span>Sync manuale</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
