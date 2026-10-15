import "dotenv/config";
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { projectInterventions } from "@/lib/db/schema";
import { growthProject, readGrowthEvidenceWith, saveIntervention } from "@/lib/analytics/growth-evidence-store";
import { makeIntervention, interventionOutcome } from "@/lib/analytics/interventions";

async function main() {
  const {values:v,positionals}=parseArgs({allowPositionals:true,options:{slug:{type:"string"},id:{type:"string"},date:{type:"string"},title:{type:"string"},kind:{type:"string"},url:{type:"string"},reference:{type:"string"},notes:{type:"string"},days:{type:"string"},apply:{type:"boolean"}}});
  if(!v.slug)throw new Error("Specify a known project with --slug.");
  const project=growthProject(db,v.slug);
  const items=db.select().from(projectInterventions).where(eq(projectInterventions.projectId,project.id)).all();
  const command=positionals[0]??"list";
  if(command==="list") {console.log(JSON.stringify(items,null,2));return;}
  if(command==="add") {
    if(!v.date||!v.title||!v.kind)throw new Error("add requires --date, --title and --kind; --apply saves locally.");
    const existing=v.id?db.select().from(projectInterventions).where(eq(projectInterventions.id,v.id)).get():undefined;
    const row=makeIntervention(project,{...v,date:v.date,title:v.title,kind:v.kind},existing);
    if(v.apply)saveIntervention(db,row,existing?.updatedAt);
    console.log(JSON.stringify({applied:Boolean(v.apply),intervention:row},null,2));return;
  }
  if(command==="report") {
    const item=items.find(r=>r.id===v.id);
    if(!item)throw new Error("Specify an intervention with --id (see list).");
    const data=readGrowthEvidenceWith(db,v.slug,item.date,item.date);
    const result=interventionOutcome(data,item,Number(v.days??28));
    const directory=path.join(process.cwd(),"project",project.slug,"reports");
    await mkdir(directory,{recursive:true});
    const destination=path.join(directory,`${new Date().toISOString().slice(0,10)}-intervention-${item.id.replace(/[^a-zA-Z0-9_-]/g,"_")}.md`);
    await writeFile(destination,`# Confronto intervento: ${item.title}\n\nConfronto descrittivo; non dimostra causalità.\n\n\`\`\`json\n${JSON.stringify(result,null,2)}\n\`\`\`\n`);
    console.log(JSON.stringify({report:destination,...result},null,2));return;
  }
  throw new Error("Commands: list, add, report.");
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
