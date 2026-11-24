import Link from "next/link";
import { notFound } from "next/navigation";
import { readProjects } from "@/lib/store";
import { SyncButton } from "@/components/sync-button";
import { ProjectTabs } from "@/components/analytics/project-tabs";
export default async function ProjectLayout({params,children}:{params:Promise<{slug:string}>;children:React.ReactNode}){
 const {slug}=await params;const p=(await readProjects()).find(p=>p.slug===slug);if(!p)notFound();
 return <main className="min-w-0 w-full max-w-[1680px] mx-auto px-4 py-5 lg:px-7"><header className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/" className="text-xs text-muted-foreground hover:underline">Progetti / {p.name}</Link><h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1><p className="text-xs text-muted-foreground">{p.type} {p.websiteUrl??""}</p></div><SyncButton projectSlug={slug}/></header><ProjectTabs slug={slug} type={p.type}/><div className="mt-5">{children}</div></main>;
}
