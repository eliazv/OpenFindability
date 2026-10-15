import "dotenv/config";
import { db,getSqliteHandle } from "@/lib/db/client";
import { recoverPlayMetrics } from "@/lib/analytics/play-data-quality";

try {console.log(JSON.stringify(recoverPlayMetrics(getSqliteHandle(db),process.argv.includes("--apply")),null,2));}
catch(error){console.error(error instanceof Error?error.message:"Play recovery failed.");process.exitCode=1;}
