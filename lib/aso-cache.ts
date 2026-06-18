import { createId } from "@/lib/id";
import type { AppData, AppKeywordMetric, AsoAppRankSnapshot, AsoKeywordSnapshot } from "@/lib/types";

export type AsoCachedRow = AppKeywordMetric & {
  cacheStatus: "fresh_cache" | "stale_cache" | "live" | "history";
  observedAt: string;
};

export type AsoCacheLookupOptions = {
  keywords: string[];
  countries: string[];
  projectId?: string;
  appId?: number;
  maxAgeDays: number;
};

export function getFreshAsoCachedRows(data: AppData, options: AsoCacheLookupOptions): AsoCachedRow[] {
  return getAsoCachedRows(data, options).filter((row) => row.cacheStatus === "fresh_cache");
}

export function getAsoCachedRows(data: AppData, options: AsoCacheLookupOptions): AsoCachedRow[] {
  const keywords = new Set(options.keywords.map(normalizeKeyword));
  const countries = new Set(options.countries.map(normalizeCountry));
  const cutoff = Date.now() - options.maxAgeDays * 86_400_000;
  const latestKeywordRows = new Map<string, AsoKeywordSnapshot>();

  for (const row of data.asoKeywordSnapshots ?? []) {
    const keyword = normalizeKeyword(row.keyword);
    const country = normalizeCountry(row.country);
    if (!keywords.has(keyword) || !countries.has(country)) continue;
    const key = cacheKey(keyword, country);
    const existing = latestKeywordRows.get(key);
    if (!existing || row.observedAt > existing.observedAt) latestKeywordRows.set(key, row);
  }

  const latestRankRows = new Map<string, AsoAppRankSnapshot>();
  for (const row of data.asoAppRankSnapshots ?? []) {
    const keyword = normalizeKeyword(row.keyword);
    const country = normalizeCountry(row.country);
    if (!keywords.has(keyword) || !countries.has(country)) continue;
    if (options.appId && row.appId !== options.appId) continue;
    if (!options.appId && options.projectId && row.projectId !== options.projectId) continue;
    const key = cacheKey(keyword, country);
    const existing = latestRankRows.get(key);
    if (!existing || row.observedAt > existing.observedAt) latestRankRows.set(key, row);
  }

  return [...latestKeywordRows.values()].map((keywordRow) => {
    const key = cacheKey(keywordRow.keyword, keywordRow.country);
    const rankRow = latestRankRows.get(key);
    const observedAt = rankRow && rankRow.observedAt > keywordRow.observedAt ? rankRow.observedAt : keywordRow.observedAt;
    return {
      id: keywordRow.id,
      projectId: options.projectId ?? rankRow?.projectId ?? "research",
      date: keywordRow.date,
      keyword: keywordRow.keyword,
      country: keywordRow.country,
      popularityScore: keywordRow.popularityScore,
      difficultyScore: keywordRow.difficultyScore,
      opportunityScore: keywordRow.opportunityScore,
      difficultyLabel: keywordRow.difficultyLabel,
      classification: keywordRow.classification,
      appRank: rankRow?.appRank ?? null,
      rawJson: {
        keyword: keywordRow.rawJson,
        rank: rankRow?.rawJson,
      },
      createdAt: keywordRow.createdAt,
      cacheStatus: new Date(observedAt).getTime() >= cutoff ? "fresh_cache" : "stale_cache",
      observedAt,
    };
  });
}

export function upsertAsoCacheRows(
  data: AppData,
  rows: AppKeywordMetric[],
  options: { projectId?: string; appId?: number; observedAt?: string; cacheStatus?: "live" | "history" },
): void {
  const observedAt = options.observedAt ?? new Date().toISOString();
  const date = observedAt.slice(0, 10);

  data.asoKeywordSnapshots ??= [];
  data.asoAppRankSnapshots ??= [];

  for (const row of rows) {
    const keyword = normalizeKeyword(row.keyword);
    const country = normalizeCountry(row.country);

    const keywordSnapshot: AsoKeywordSnapshot = {
      id: createId("aso_kw"),
      date: row.date || date,
      keyword: row.keyword,
      country,
      source: "respectaso",
      popularityScore: row.popularityScore,
      difficultyScore: row.difficultyScore,
      opportunityScore: row.opportunityScore,
      difficultyLabel: row.difficultyLabel,
      classification: row.classification,
      competitorCount: readCompetitorCount(row.rawJson),
      rawJson: row.rawJson,
      observedAt,
      createdAt: observedAt,
    };
    upsertByKey(
      data.asoKeywordSnapshots,
      keywordSnapshot,
      (item) => `${item.source}:${item.date}:${normalizeCountry(item.country)}:${normalizeKeyword(item.keyword)}`,
    );

    if (row.appRank !== undefined || options.projectId || options.appId) {
      const rankSnapshot: AsoAppRankSnapshot = {
        id: createId("aso_rank"),
        date: row.date || date,
        keyword: row.keyword,
        country,
        source: "respectaso",
        projectId: options.projectId,
        appId: options.appId,
        appRank: row.appRank ?? null,
        rawJson: row.rawJson,
        observedAt,
        createdAt: observedAt,
      };
      upsertByKey(
        data.asoAppRankSnapshots,
        rankSnapshot,
        (item) =>
          `${item.source}:${item.date}:${item.appId ?? ""}:${item.projectId ?? ""}:${normalizeCountry(item.country)}:${normalizeKeyword(
            item.keyword,
          )}`,
      );
    }
  }
}

export function missingKeywordCountryPairs(
  keywords: string[],
  countries: string[],
  rows: { keyword: string; country: string }[],
): { keywords: string[]; countries: string[] } {
  const present = new Set(rows.map((row) => cacheKey(row.keyword, row.country)));
  const missingKeywords = new Set<string>();
  const missingCountries = new Set<string>();

  for (const keyword of keywords) {
    for (const country of countries) {
      if (!present.has(cacheKey(keyword, country))) {
        missingKeywords.add(keyword);
        missingCountries.add(country);
      }
    }
  }

  return { keywords: [...missingKeywords], countries: [...missingCountries] };
}

export function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeCountry(value: string): string {
  return value.trim().toLowerCase();
}

function cacheKey(keyword: string, country: string): string {
  return `${normalizeCountry(country)}:${normalizeKeyword(keyword)}`;
}

function upsertByKey<T>(rows: T[], row: T, keyOf: (row: T) => string): void {
  const key = keyOf(row);
  const index = rows.findIndex((existing) => keyOf(existing) === key);
  if (index >= 0) rows[index] = row;
  else rows.push(row);
}

function readCompetitorCount(rawJson: unknown): number | undefined {
  if (!rawJson || typeof rawJson !== "object") return undefined;
  const value = (rawJson as Record<string, unknown>).competitors ?? (rawJson as Record<string, unknown>).Competitors;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return undefined;
}
