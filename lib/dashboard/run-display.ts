import type {ConnectorRun} from "@/lib/types";
import {cliErrorMessage} from "@/lib/cli-error";
/** Whitelist diagnostic counters; never serialize complete provider/release payloads to the browser. */
export function runDetails(run:ConnectorRun){
 const stats=run.stats??{},counts=["snapshots","queries","pages","keywords","reviews","observations"].flatMap(key=>typeof stats[key]==="number"?[key+": "+stats[key]]:[]);
 const message=run.errorMessage??(typeof stats.message==="string"?stats.message:"");
 return {message:message?cliErrorMessage(new Error(message)).slice(0,2000):null,counts:counts.join(" · "),duration:Math.max(0,Math.round((Date.parse(run.finishedAt)-Date.parse(run.startedAt))/1000))};
}
