import { db, getSqliteHandle } from "@/lib/db/client";
import { projects as projectsTable, webPerformanceMetrics, connectorRuns } from "@/lib/db/schema";
import { createId } from "@/lib/id";
import { fetchPerformance, performanceSample, publicPageUrl, type Device, type PerformanceSource, type PerformanceRow } from "@/lib/connectors/web-performance";
import type { ConnectorRun } from "@/lib/types";

export async function auditPerformance(options:{slug?:string;url?:string;limit?:number;device?:Device;source?:PerformanceSource;apply?:boolean;force?:boolean}={}) {
  const sqlite=getSqliteHandle(db);
  const projects=db.select().from(projectsTable).all().filter(p=>p.websiteUrl && (p.gscProperty||p.ga4PropertyId||p.umamiWebsiteId) && (!options.slug||p.slug===options.slug));
  if (options.slug && !projects.length) throw new Error("Unknown project or no active web analytics mapping.");
  if (options.url && projects.length!==1) throw new Error("An explicit URL requires one project (--slug).");
  const device=options.device??"mobile", sources:PerformanceSource[]=options.source?[options.source]:["pagespeed","crux"];
  const output=[];
  for (const project of projects) {
    const cutoff=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    const pages=sqlite.prepare("SELECT page,sum(impressions) AS impressions FROM page_metrics WHERE project_id=? AND date>=? AND json_valid(raw_json) AND json_extract(raw_json,'$._openfindability.grain')='day' GROUP BY page ORDER BY impressions DESC LIMIT 500").all(project.id,cutoff) as {page:string;impressions:number}[];
    const urls=options.url?[publicPageUrl(options.url,project.websiteUrl!)]:performanceSample(project.websiteUrl!,pages,options.limit??3);
    const targets=sources.flatMap(source=>[...urls.map(url=>({source,url,scope:"url" as const})),...(source==="crux"?[{source,url:new URL(project.websiteUrl!).origin,scope:"origin" as const}]:[])]);
    if (!options.apply) {output.push({slug:project.slug,device,targets,cruxConfigured:Boolean(process.env.CRUX_API_KEY),pagespeedKeyConfigured:Boolean(process.env.PAGESPEED_API_KEY)});continue;}
    const rows:PerformanceRow[]=[]; const runs:ConnectorRun[]=[];
    for (const target of targets) {
      const startedAt=new Date().toISOString();
      const cached=sqlite.prepare("SELECT id FROM web_performance_metrics WHERE project_id=? AND source=? AND url=? AND scope=? AND device=? AND date=?").get(project.id,target.source,target.url,target.scope,device,startedAt.slice(0,10));
      if (cached && !options.force) {output.push({slug:project.slug,...target,status:"cached"});continue;}
      let status:ConnectorRun["status"]="success", errorMessage:string|undefined;
      if (target.source==="crux" && !process.env.CRUX_API_KEY) { status="skipped";errorMessage="CRUX_API_KEY missing."; }
      else try {const row=await fetchPerformance(project.id,target.source,target.url,target.scope,device);rows.push(row);if(row.status==="no_data")status="no_data";}
      catch(error) {status="failed";errorMessage=error instanceof Error?error.message:"Performance request failed.";}
      runs.push({id:createId("run"),projectId:project.id,source:target.source,status,startedAt,finishedAt:new Date().toISOString(),errorMessage,stats:{url:target.url,scope:target.scope,device}});
      output.push({slug:project.slug,...target,status,message:errorMessage});
    }
    if (runs.length) db.transaction(tx=>{
      for(const row of rows)tx.insert(webPerformanceMetrics).values(row).onConflictDoUpdate({target:webPerformanceMetrics.id,set:row}).run();
      for(const run of runs)tx.insert(connectorRuns).values(run).run();
      sqlite.prepare("UPDATE _openfindability_store_revision SET revision=revision+1 WHERE id=1").run();
    });
  }
  return output;
}
