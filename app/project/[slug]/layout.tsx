import {linkedWebsite} from "@/lib/dashboard/favicon";
import {projectIcon} from "@/lib/dashboard/project-icon";
import {ProjectAvatar} from "@/components/analytics/project-avatar";
import {existsSync} from "node:fs";
import {join} from "node:path";
import { notFound } from "next/navigation";
import { readProjects } from "@/lib/store";
import { SyncButton } from "@/components/sync-button";
import { ProjectTabs } from "@/components/analytics/project-tabs";
export default async function ProjectLayout({params,children}:{params:Promise<{slug:string}>;children:React.ReactNode}){
 const {slug}=await params;const p=(await readProjects()).find(p=>p.slug===slug);if(!p)notFound();
 const icon=await projectIcon(p);
 const hasStudio=!!p.flutterProjectPath&&existsSync(join(p.flutterProjectPath,"store","studio","studio.config.json"));
 return <div className="min-w-0 w-full max-w-[1680px] mx-auto px-4 py-4 lg:px-6"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><ProjectAvatar name={p.name} icon={icon} websiteUrl={linkedWebsite(p)} type={p.type}/>{p.name}</h1>{p.websiteUrl&&<a href={p.websiteUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">{p.websiteUrl}</a>}</div><div className="flex flex-wrap items-start gap-2">{hasStudio&&<a className="h-9 inline-flex items-center rounded-md border px-3 text-sm hover:bg-muted" href={"http://127.0.0.1:5177/?project="+encodeURIComponent(slug)} target="_blank" rel="noreferrer">Store Studio ↗</a>}<SyncButton projectSlug={slug} compact/></div></header><ProjectTabs slug={slug} type={p.type}/><div className="mt-4">{children}</div></div>;
}
