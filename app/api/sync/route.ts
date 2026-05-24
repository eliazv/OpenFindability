import { NextResponse } from "next/server";
import { syncProjects } from "@/lib/sync";
import type { SourceType } from "@/lib/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceParam = url.searchParams.get("source");
  const source = sourceParam === "gsc" || sourceParam === "umami" ? (sourceParam as SourceType) : undefined;
  const results = await syncProjects({ source });
  return NextResponse.json({ results });
}
