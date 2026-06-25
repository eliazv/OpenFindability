import type { Metadata } from "next";
import "./globals.css";
import { readData } from "@/lib/store";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export const metadata: Metadata = {
  title: "OpenFindability",
  description: "Open-source SEO and ASO intelligence for web and mobile projects.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const data = await readData();

  return (
    <html lang="it">
      <body>
        <SidebarProvider>
          <AppSidebar projects={data.projects} />
          <SidebarInset>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-4" />
              <span className="text-sm text-muted-foreground">OpenFindability v0.1</span>
            </header>
            {children}
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
