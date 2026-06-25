import { NextResponse } from "next/server";
import { syncProjects } from "@/lib/sync";
import type { SourceType } from "@/lib/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceParam = url.searchParams.get("source");
  const validSources: SourceType[] = ["gsc", "umami", "play_console", "revenuecat", "admob"];
  const source = validSources.includes(sourceParam as SourceType) ? (sourceParam as SourceType) : undefined;
  const results = await syncProjects({ source });
  return NextResponse.json({ results });
}
