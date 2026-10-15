import { and, eq, gte, lte } from "drizzle-orm";
import { getSqliteHandle, type AppDb } from "@/lib/db/client";
import { projects, ga4LandingMetrics, webPerformanceMetrics, projectInterventions, pageMetrics, metricSnapshots, connectorRuns } from "@/lib/db/schema";
import type { AppData, Project, MetricSnapshot, PageMetric, ConnectorRun } from "@/lib/types";
import { isoDay, type Intervention } from "./interventions";

function denull<T>(row:unknown):T {return Object.fromEntries(Object.entries(row as Record<string,unknown>).map(([k,v])=>[k,v===null?undefined:v])) as T;}
export function growthProject(database:AppDb,slug:string):Project {
  const row=database.select().from(projects).where(eq(projects.slug,slug)).get();
  if(!row)throw new Error("Project not found.");
  return denull<Project>(row);
}

export function readGrowthEvidenceWith(database:AppDb,slug:string,start:string,end:string) {
  isoDay(start);isoDay(end);if(start>end)throw new Error("Invalid date range.");
  // One consistent scoped SQLite snapshot; do not materialize the full warehouse.
  return getSqliteHandle(database).transaction(()=>{
    const project=growthProject(database,slug);
    const interventions=database.select().from(projectInterventions).where(eq(projectInterventions.projectId,project.id)).all();
    const shift=(date:string,n:number)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);
    const first=[start,...interventions.map(r=>shift(r.date,-90))].sort()[0];
    const last=[end,...interventions.map(r=>shift(r.date,90))].sort().at(-1)!;
    return {
      projects:[project],projectInterventions:interventions,
      ga4LandingMetrics:database.select().from(ga4LandingMetrics).where(and(eq(ga4LandingMetrics.projectId,project.id),gte(ga4LandingMetrics.date,first),lte(ga4LandingMetrics.date,last))).all(),
      webPerformanceMetrics:database.select().from(webPerformanceMetrics).where(eq(webPerformanceMetrics.projectId,project.id)).all(),
      metricSnapshots:interventions.length?database.select().from(metricSnapshots).where(and(eq(metricSnapshots.projectId,project.id),eq(metricSnapshots.source,"gsc"),gte(metricSnapshots.date,first),lte(metricSnapshots.date,last))).all().map(denull<MetricSnapshot>):[],
      pageMetrics:interventions.some(r=>r.targetUrl)?database.select().from(pageMetrics).where(and(eq(pageMetrics.projectId,project.id),gte(pageMetrics.date,first),lte(pageMetrics.date,last))).all().map(denull<PageMetric>):[],
      connectorRuns:database.select().from(connectorRuns).where(eq(connectorRuns.projectId,project.id)).all().map(denull<ConnectorRun>),
    } satisfies Pick<AppData,"projects"|"projectInterventions"|"ga4LandingMetrics"|"webPerformanceMetrics"|"metricSnapshots"|"pageMetrics"|"connectorRuns">;
  })();
}

export function saveIntervention(database:AppDb,row:Intervention,expectedUpdatedAt?:string) {
  database.transaction(tx=>{
    const current=tx.select().from(projectInterventions).where(eq(projectInterventions.id,row.id)).get();
    if(current?.updatedAt!==expectedUpdatedAt)throw new Error("Intervention changed; retry from a fresh snapshot.");
    tx.insert(projectInterventions).values(row).onConflictDoUpdate({target:projectInterventions.id,set:row}).run();
    getSqliteHandle(database).prepare("UPDATE _openfindability_store_revision SET revision=revision+1 WHERE id=1").run();
  });
}
