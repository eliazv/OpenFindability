import {localRequestError} from "@/lib/dashboard/local-request";
import {NextResponse} from "next/server";
import {db,getSqliteHandle} from "@/lib/db/client";
import {opportunities} from "@/lib/db/schema";
import {and,eq} from "drizzle-orm";
import {growthProject,saveIntervention} from "@/lib/analytics/growth-evidence-store";
import {makeIntervention} from "@/lib/analytics/interventions";
import {savePreferences} from "@/lib/dashboard/preferences";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){
 const denied=localRequestError(request,true);if(denied)return NextResponse.json({error:denied},{status:403});
 try{
  const {slug}=await params,p=growthProject(db,slug),body=await request.json();
  if(!body||typeof body!=="object")throw new Error("Invalid request");
  if(body.action==="preferences"){savePreferences(db,p.id,body.preferences);return NextResponse.json({ok:true});}
  if(body.action==="intervention"){
   const {date,title,kind,targetUrl,reference,notes}=body;
   if(typeof date!=="string"||typeof title!=="string"||typeof kind!=="string"||[targetUrl,reference,notes].some(v=>v!==undefined&&(typeof v!=="string"||v.length>4000)))throw new Error("Invalid intervention");
   const item=makeIntervention(p,{date,title,kind,url:targetUrl,reference,notes});saveIntervention(db,item);return NextResponse.json({ok:true,id:item.id});
  }
  if(body.action==="opportunity"){
   if(typeof body.id!=="string"||!["open","ignored","done","planned","working","verify"].includes(body.status))throw new Error("Invalid opportunity status");
   const n=getSqliteHandle(db);
   n.transaction(()=>{const row=db.select().from(opportunities).where(and(eq(opportunities.id,body.id),eq(opportunities.projectId,p.id))).get();if(!row)throw new Error("Opportunity not found");
    const raw=row.rawJson&&typeof row.rawJson==="object"?row.rawJson as Record<string,unknown>:{evidence:row.rawJson};
    const status=body.status==="ignored"?"ignored":body.status==="done"?"done":"open";
    const history=Array.isArray(raw.history)?raw.history.slice(-99):[];
    db.update(opportunities).set({status,rawJson:{...raw,workflow:body.status,history:[...history,{status:body.status,at:new Date().toISOString()}]}}).where(eq(opportunities.id,row.id)).run();
    n.prepare("UPDATE _openfindability_store_revision SET revision=revision+1 WHERE id=1").run();
   }).immediate();
   return NextResponse.json({ok:true});
  }
  throw new Error("Unknown action");
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Operation failed"},{status:400});}
}
