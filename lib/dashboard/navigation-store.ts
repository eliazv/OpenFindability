import {getSqliteHandle,type AppDb} from "@/lib/db/client";
import {projects,projectDashboardPreferences as t} from "@/lib/db/schema";
import {validateNavigation} from "./navigation";
export function saveNavigation(database:AppDb,input:unknown,reset=false){
 const n=getSqliteHandle(database);
 n.transaction(()=>{
  const ids=new Set(database.select({id:projects.id}).from(projects).all().map(p=>p.id));
  const rows=validateNavigation(input,ids),updatedAt=new Date().toISOString();
  rows.forEach((row,index)=>{
   const sidebarOrder=reset?null:index,sidebarHidden=reset?null:row.hidden;
   database.insert(t).values({projectId:row.id,sidebarOrder,sidebarHidden,updatedAt}).onConflictDoUpdate({target:t.projectId,set:{sidebarOrder,sidebarHidden,updatedAt}}).run();
  });
  n.prepare("UPDATE _openfindability_store_revision SET revision=revision+1 WHERE id=1").run();
 }).immediate();
}
