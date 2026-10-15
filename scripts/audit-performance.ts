import "dotenv/config";
import { parseArgs } from "node:util";
import { auditPerformance } from "@/lib/analytics/performance-audit";

async function main() {
  const {values}=parseArgs({options:{slug:{type:"string"},url:{type:"string"},limit:{type:"string"},device:{type:"string",default:"mobile"},source:{type:"string"},apply:{type:"boolean"},force:{type:"boolean"}}});
  if (values.device!=="mobile" && values.device!=="desktop") throw new Error("--device mobile|desktop");
  if (values.source && values.source!=="pagespeed" && values.source!=="crux") throw new Error("--source pagespeed|crux");
  const limit=Number(values.limit??3);
  if (!Number.isSafeInteger(limit)||limit<1||limit>10) throw new Error("--limit must be 1..10");
  const output=await auditPerformance({...values,limit,device:values.device,source:values.source as "pagespeed"|"crux"|undefined});
  console.log(JSON.stringify(output,null,2));
  if(output.some(r=>"status" in r && r.status==="failed"))process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
