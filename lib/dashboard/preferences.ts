import {eq} from "drizzle-orm";
import {getSqliteHandle,type AppDb} from "@/lib/db/client";
import {projectDashboardPreferences as t,projects} from "@/lib/db/schema";
import {METRICS,projectMetric} from "@/lib/dashboard/read-model";
import type {AppData,Project} from "@/lib/types";
export type Preferences=typeof t.$inferSelect;
export const metricOptions=Object.values(METRICS).map(s=>({id:s.source+":"+s.key,label:s.label,unit:s.unit,goalAllowed:!("lowerBetter" in s&&s.lowerBetter)}));
export function metricById(id:string){return Object.values(METRICS).find(s=>s.source+":"+s.key===id);}
export function readPreferences(database:AppDb,projectId?:string){return database.select().from(t).where(projectId?eq(t.projectId,projectId):undefined).all();}
export function savePreferences(database:AppDb,id:string,input:unknown){
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Invalid preferences");
 const p=input as Record<string,unknown>;
 if(typeof p.favorite!=="boolean"||typeof p.archived!=="boolean"||!Array.isArray(p.primaryMetrics)||p.primaryMetrics.length>4||p.primaryMetrics.some(v=>typeof v!=="string"||!metricById(v)))throw new Error("Invalid project preferences");
 const metric=typeof p.goalMetric==="string"&&p.goalMetric?metricById(p.goalMetric):undefined;
 if(p.goalMetric&&(!metric||("lowerBetter" in metric&&metric.lowerBetter)))throw new Error("Invalid goal metric");
 const target=p.goalTarget;
 if(metric&&(typeof target!=="number"||!Number.isFinite(target)||target<=0))throw new Error("Invalid goal target");
 const currency=metric?.unit==="currency"&&typeof p.goalCurrency==="string"&&/^[A-Z]{3}$/.test(p.goalCurrency)?p.goalCurrency:null;
 if(metric?.unit==="currency"&&!currency)throw new Error("Currency required");
 const row={projectId:id,favorite:p.favorite,archived:p.archived,primaryMetrics:[...new Set(p.primaryMetrics as string[])],goalMetric:metric?metric.source+":"+metric.key:null,goalTarget:metric?target as number:null,goalCurrency:currency,updatedAt:new Date().toISOString()};
 const native=getSqliteHandle(database);
 native.transaction(()=>{if(!database.select({id:projects.id}).from(projects).where(eq(projects.id,id)).get())throw new Error("Project not found");database.insert(t).values(row).onConflictDoUpdate({target:t.projectId,set:row}).run();native.prepare("UPDATE _openfindability_store_revision SET revision=revision+1 WHERE id=1").run();}).immediate();
 return row;
}
export function orderModels<T extends {spec:{source:string;key:string}}>(models:T[],prefs?:Preferences){
 const keys=prefs?.primaryMetrics??[];
 return [...models].sort((a,b)=>{const i=(m:T)=>{const n=keys.indexOf(m.spec.source+":"+m.spec.key);return n<0?999:n;};return i(a)-i(b);});
}
export function goalProgress(data:AppData,project:Project,prefs?:Preferences){
 const spec=prefs?.goalMetric?metricById(prefs.goalMetric):undefined;
 if(!spec||!prefs?.goalTarget)return null;
 const m=projectMetric(data,project.id,spec,28).result;
 const complete=spec.kind==="snapshot"?m.value!==null:m.observed===m.expected;
 const value=complete&&(!prefs.goalCurrency||prefs.goalCurrency===m.currency)?m.value:null;
 return {label:spec.label,value,target:prefs.goalTarget,unit:spec.unit,currency:prefs.goalCurrency??undefined,range:m.range,kind:spec.kind,lowerBetter:spec.lowerBetter??false};
}
