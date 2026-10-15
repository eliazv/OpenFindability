import { createHash } from "node:crypto";
import type { MetricSnapshot, SeoGeoObservation, SeoGeoSource, SyncResult } from "@/lib/types";

export type SeoGeoImport = { result: SyncResult; snapshots: MetricSnapshot[]; observations: SeoGeoObservation[]; replaceWindow?: { start: string; end: string; kind: string } };

export function imported(source: SeoGeoSource, projectId: string, observations: SeoGeoObservation[] = [], snapshots: MetricSnapshot[] = [], message?: string, status?: SyncResult["status"]): SeoGeoImport {
  return { observations, snapshots, result: {
    source, projectId, status: status ?? (observations.length || snapshots.length ? "success" : "no_data"),
    message: message ?? `Imported ${observations.length} observations and ${snapshots.length} daily totals.`,
    inserted: { snapshots: snapshots.length, queries: observations.filter(r => r.kind === "query").length, pages: observations.filter(r => r.kind === "page").length, observations: observations.length },
  } };
}

export function stableKey(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function observation(input: Omit<SeoGeoObservation, "id" | "recordKey">): SeoGeoObservation {
  const recordKey = stableKey([input.windowStart, input.windowEnd, input.scope]);
  return { ...input, recordKey, id: stableKey([input.projectId, input.source, input.kind, recordKey]) };
}

// Never include URLs/bodies in errors: query strings can contain Bing's API key.
export async function fetchJson(url: string | URL, init: RequestInit = {}, attempts = 3): Promise<unknown> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Response;
    try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(45000) }); }
    catch { throw new Error("Provider connection failed or timed out."); }
    if (response.ok) {
      try { return await response.json(); } catch { throw new Error("Provider returned invalid JSON."); }
    }
    if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
      const seconds = Number(response.headers.get("retry-after"));
      await new Promise(resolve => setTimeout(resolve, Math.min(10000, seconds > 0 ? seconds * 1000 : 500 * 2 ** attempt)));
      continue;
    }
    throw new Error(`Provider request failed (HTTP ${response.status}).`);
  }
  throw new Error("Provider retry limit reached.");
}

export function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname.toLowerCase(); } catch { return undefined; }
}

export function finite(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
