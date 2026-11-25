import {NextResponse} from "next/server";
import {db} from "@/lib/db/client";
import {growthProject} from "@/lib/analytics/growth-evidence-store";
import {iterateGscExport} from "@/lib/store";
import {validDay} from "@/lib/dashboard/metrics";
import {csvText} from "@/lib/dashboard/csv";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{slug:string}>}){
 const url=new URL(request.url);if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname))return NextResponse.json({error:"Local only"},{status:403});
 const from=url.searchParams.get("from"),to=url.searchParams.get("to"),kind=url.searchParams.get("kind")==="page"?"page":"query";
 if(!validDay(from)||!validDay(to)||from>to||Date.parse(to)-Date.parse(from)>364*86400000)return NextResponse.json({error:"Invalid period"},{status:400});
 try{const {slug}=await params,p=growthProject(db,slug),rows=iterateGscExport(db,p.id,from,to,kind,{search:url.searchParams.get("q")??undefined,sort:url.searchParams.get("sort")??undefined});
 // Keep SQLite iteration synchronous to avoid leaving the shared connection busy between network chunks.
 const chunks=["\ufeff"+csvText([kind==="page"?"URL":"Query","Click","Impression","CTR %","Posizione"],[])];for(const r of rows)chunks.push(csvText([],[[r.key,r.clicks,r.impressions,r.ctr,r.position]]).slice(2));
 return new Response(chunks.join("\r\n"),{headers:{"Content-Type":"text/csv;charset=utf-8","Content-Disposition":'attachment; filename="gsc-'+kind+'.csv"',"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Export non disponibile"},{status:400});}
}
