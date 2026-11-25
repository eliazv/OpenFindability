import {linkedWebsite} from "@/lib/dashboard/favicon";
import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { projectIcon } from "@/lib/dashboard/project-icon";
import { readProjects } from "@/lib/store";
import {SyncProgress} from "@/components/analytics/sync-progress";
import { ThemeToggle } from "@/components/analytics/theme-toggle";
import { ProjectSwitcher } from "@/components/analytics/project-switcher";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export const metadata: Metadata = {
  title: "OpenFindability",
  description: "Open-source SEO and ASO intelligence for web and mobile projects.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const projects = await Promise.all((await readProjects()).map(async (p) => ({ id:p.id, slug:p.slug, name:p.name, type:p.type, websiteUrl:linkedWebsite(p), icon:await projectIcon(p) })));
  const cookieStore = await cookies();
  const dark = cookieStore.get("dashboard_theme")?.value === "dark";

  return (
    <html lang="it" className={dark ? "dark" : undefined}>
      <body>
        <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
          <AppSidebar projects={projects} />
          <SidebarInset className="min-w-0">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
              <SidebarTrigger />
              
              <div className="ml-auto flex gap-2 items-center"><ProjectSwitcher projects={projects.map(({slug,name})=>({slug,name}))}/><ThemeToggle initialDark={dark}/></div>
            </header>
            <SyncProgress/>
            {children}
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
