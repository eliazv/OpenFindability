import {NextResponse} from "next/server";
import {readDashboardData} from "@/lib/store";
import {parseDashboardPeriod} from "@/lib/dashboard/metrics";
import {buildPortfolioReport} from "@/lib/analytics/portfolio-report";
export const runtime="nodejs";
export async function GET(request:Request){
 const url=new URL(request.url);
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname))return NextResponse.json({error:"Local only"},{status:403});
 const period=parseDashboardPeriod(Object.fromEntries(url.searchParams)),data=await readDashboardData("growth");
 return new Response(buildPortfolioReport(data,period.days,period.end,period.comparison),{headers:{"Content-Type":"text/markdown; charset=utf-8","Content-Disposition":'attachment; filename="openfindability-portfolio.md"',"Cache-Control":"no-store"}});
}
