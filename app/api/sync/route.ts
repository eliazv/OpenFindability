import {localRequestError} from "@/lib/dashboard/local-request";
import { NextResponse } from "next/server";
import { readProjects } from "@/lib/store";
import {cliErrorMessage} from "@/lib/cli-error";
import {db} from "@/lib/db/client";
import {syncProgress,SyncAlreadyRunning} from "@/lib/sync-store";
import { syncProjects } from "@/lib/sync";
import type { SourceType } from "@/lib/types";

export const runtime = "nodejs";
const allowedSources: SourceType[] = [
  "ga4_landing",
  "bing_webmaster", "cloudflare_ai", "clarity",
  "gsc", "ga4", "umami", "play_console", "aso", "revenuecat",
  "admob", "adsense", "play_vitals", "play_stats", "asc_analytics",
];

let running = false;

// Reading this URL must NEVER start a write or consume provider quotas.
export async function GET(request:Request) {
 const denied=localRequestError(request);if(denied)return NextResponse.json({error:denied},{status:403});
 return NextResponse.json({progress:syncProgress(db)},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request: Request) {
  const denied=localRequestError(request,true);
  if(denied)return NextResponse.json({error:denied},{status:403});
  const body = await request.json().catch(() => null) as { source?: unknown; projectSlug?: unknown; backfillDays?:unknown } | null;
  if (body === null || typeof body !== "object" || Array.isArray(body) || (body.source !== undefined && (typeof body.source !== "string" || !allowedSources.includes(body.source as SourceType)))) {
    return NextResponse.json({ error: "Invalid source." }, { status: 400 });
  }
  const projectSlug = body.projectSlug;
  if (projectSlug !== undefined && (typeof projectSlug !== "string" || !(await readProjects()).some(p => p.slug === projectSlug))) {
    return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  }
  if(body.backfillDays!==undefined&&(typeof body.backfillDays!=="number"||!Number.isSafeInteger(body.backfillDays)||body.backfillDays<7||body.backfillDays>365))return NextResponse.json({error:"Invalid period."},{status:400});
  if (running) return NextResponse.json({ error: "A sync is already running." }, { status: 409 });
  running = true;
  try {
    const source = body.source as SourceType | undefined;
    const results = await syncProjects({ source, projectSlug: projectSlug as string | undefined,backfillDays:body.backfillDays as number|undefined });
    const failed = results.some((result) => result.status === "failed");
    return NextResponse.json({ results }, { status: failed ? 207 : 200 });
  } catch (error) {
    if(error instanceof SyncAlreadyRunning)return NextResponse.json({error:error.message},{status:409});
    console.error("OpenFindability sync failed:", cliErrorMessage(error));
    return NextResponse.json({ error: "Sync failed. See the server log for details." }, { status: 500 });
  } finally {
    running = false;
  }
}
