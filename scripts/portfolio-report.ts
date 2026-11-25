import "dotenv/config";
import {readDashboardData} from "@/lib/store";
import {parseDays} from "@/lib/dashboard/metrics";
import {buildPortfolioReport} from "@/lib/analytics/portfolio-report";
const days=parseDays(process.argv.slice(2).find(a=>a!=="--"));
readDashboardData("growth").then(data=>process.stdout.write(buildPortfolioReport(data,days))).catch(error=>{console.error(error instanceof Error?error.message:"Report failed");process.exitCode=1;});
