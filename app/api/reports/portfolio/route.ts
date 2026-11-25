import {localRequestError} from "@/lib/dashboard/local-request";
import {NextResponse} from "next/server";
import {readDashboardData} from "@/lib/store";
import {parseDashboardPeriod} from "@/lib/dashboard/metrics";
import {buildPortfolioReport} from "@/lib/analytics/portfolio-report";
export const runtime="nodejs";
export async function GET(request:Request){
 const url=new URL(request.url);
 const denied=localRequestError(request);if(denied)return NextResponse.json({error:denied},{status:403});
 const period=parseDashboardPeriod(Object.fromEntries(url.searchParams)),data=await readDashboardData("growth");
 return new Response(buildPortfolioReport(data,period.days,period.end,period.comparison),{headers:{"Content-Type":"text/markdown; charset=utf-8","Content-Disposition":'attachment; filename="openfindability-portfolio.md"',"Cache-Control":"no-store"}});
}
