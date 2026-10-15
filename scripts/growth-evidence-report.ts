import "dotenv/config";
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db/client";
import { readGrowthEvidenceWith } from "@/lib/analytics/growth-evidence-store";
import { daysAgo } from "@/lib/dates";
import { growthEvidenceSnapshot } from "@/lib/analytics/growth-evidence";

async function main() {
  const {values:v}=parseArgs({options:{slug:{type:"string"},start:{type:"string"},end:{type:"string"},limit:{type:"string"}}});
  if(!v.slug)throw new Error("Specify --slug.");
  const start=v.start??daysAgo(29),end=v.end??daysAgo(2);
  const result=growthEvidenceSnapshot(readGrowthEvidenceWith(db,v.slug,start,end),v.slug,start,end,Number(v.limit??50));
  const directory=path.join(process.cwd(),"project",result.project.slug,"reports");await mkdir(directory,{recursive:true});
  const destination=path.join(directory,`${daysAgo(0)}-growth-evidence.md`);
  await writeFile(destination,`# Conversioni, prestazioni e interventi\n\n${result.project.name}\n\nLe fonti e i periodi sono separati; i dati mancanti non sono zeri.\n\n\`\`\`json\n${JSON.stringify(result,null,2)}\n\`\`\`\n`);
  console.log(destination);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
