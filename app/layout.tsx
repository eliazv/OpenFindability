import {db} from "@/lib/db/client";
import {readPreferences} from "@/lib/dashboard/preferences";
import {navigationItems} from "@/lib/dashboard/navigation";
import {linkedWebsite} from "@/lib/dashboard/favicon";
import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { projectIcon } from "@/lib/dashboard/project-icon";
import { readProjects } from "@/lib/store";
import {DashboardShell} from "@/components/analytics/dashboard-shell";
import {SidebarProvider} from "@/components/ui/sidebar";

export const metadata: Metadata = {
  title: "OpenFindability",
  description: "Open-source SEO and ASO intelligence for web and mobile projects.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const projects = navigationItems(await Promise.all((await readProjects()).map(async (p) => ({ id:p.id, slug:p.slug, name:p.name, type:p.type, websiteUrl:linkedWebsite(p), icon:await projectIcon(p) }))),readPreferences(db));
  const cookieStore = await cookies();
  const dark = cookieStore.get("dashboard_theme")?.value === "dark";

  return (
    <html lang="it" className={dark ? "dark" : undefined}>
      <body>
        <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
          <DashboardShell projects={projects} initialDark={dark}>{children}</DashboardShell>
        </SidebarProvider>
      </body>
    </html>
  );
}
