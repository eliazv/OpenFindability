import { NextResponse } from "next/server";
import { syncProjects } from "@/lib/sync";
import type { SourceType } from "@/lib/types";

export const runtime = "nodejs";
const allowedSources: SourceType[] = [
  "gsc", "ga4", "umami", "play_console", "aso", "revenuecat",
  "admob", "adsense", "play_vitals", "play_stats", "asc_analytics",
];

let running = false;

// Reading this URL must NEVER start a write or consume provider quotas.
export async function GET() {
  return NextResponse.json({ message: "Use POST from the local dashboard to start a sync." }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  // This application currently has no sign-in/session system. Until one
  // exists, remote deployments cannot invoke the mutating endpoint at all.
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!localHost || origin !== url.origin) {
    return NextResponse.json({ error: "Sync is restricted to same-origin localhost." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { source?: unknown } | null;
  if (body === null || (body.source !== undefined && (typeof body.source !== "string" || !allowedSources.includes(body.source as SourceType)))) {
    return NextResponse.json({ error: "Invalid source." }, { status: 400 });
  }
  if (running) return NextResponse.json({ error: "A sync is already running." }, { status: 409 });
  running = true;
  try {
    const source = body.source as SourceType | undefined;
    const results = await syncProjects({ source });
    const failed = results.some((result) => result.status === "failed");
    return NextResponse.json({ results }, { status: failed ? 207 : 200 });
  } catch (error) {
    console.error("OpenFindability sync failed:", error);
    return NextResponse.json({ error: "Sync failed. See the server log for details." }, { status: 500 });
  } finally {
    running = false;
  }
}
