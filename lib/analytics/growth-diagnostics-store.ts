import {getSqliteHandle,type AppDb} from "@/lib/db/client";
import {dayRange} from "@/lib/dashboard/metrics";
import {seoDiagnostics,brandTerms,type QuerySample} from "./growth-diagnostics";
export function queryDiagnostics(database:AppDb,id:string,end:string,days:number,brandInput:string){
 const range=dayRange(end,days),native=getSqliteHandle(database);
 const rows=native.prepare(`SELECT query,sum(clicks) clicks,sum(impressions) impressions,sum(avg_position*impressions)*1.0/nullif(sum(impressions),0) position FROM search_queries WHERE project_id=? AND date BETWEEN ? AND ? AND json_extract(raw_json,'$._openfindability.grain')='day' AND json_extract(raw_json,'$._openfindability.version')=2 GROUP BY query ORDER BY impressions DESC,query LIMIT 5000`).all(id,range.from,range.to) as QuerySample[];
 return {range,limit:5000,...seoDiagnostics(rows,brandTerms(brandInput))};
}
