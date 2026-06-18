import { createId } from "@/lib/id";
import { nowIso } from "@/lib/dates";
import type { AppKeywordMetric, Project, SyncResult } from "@/lib/types";

export type AsoKeywordResult = {
  keyword: string;
  country: string;
  popularity_score?: number;
  difficulty_score?: number;
  opportunity_score?: number;
  difficulty_label?: string;
  classification?: string;
  app_rank?: number | null;
};

export type AsoSearchResponse = {
  results_by_country?: Record<string, AsoKeywordResult[]>;
};

const DEFAULT_BASE_URL = "http://localhost";

export async function syncAsoProject(project: Project): Promise<{
  result: SyncResult;
  keywords: AppKeywordMetric[];
}> {
  if (!project.asoKeywords || project.asoKeywords.length === 0) {
    return skipped(project.id, "Project has no ASO keywords configured (asoKeywords).");
  }

  const baseUrl = process.env.RESPECT_ASO_BASE_URL ?? DEFAULT_BASE_URL;
  const countries = project.asoCountries && project.asoCountries.length > 0 ? project.asoCountries : ["it"];

  let session: AsoSession;
  try {
    session = await createAsoSession(baseUrl);
  } catch (error) {
    return skipped(
      project.id,
      `RespectASO is not reachable at ${baseUrl}. Start it with \`docker compose up -d\` in the respectaso directory. (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  const createdAt = nowIso();

  const appId = project.respectAsoAppId ?? project.appStoreTrackId;
  const response = await searchRespectAsoKeywords({
    baseUrl,
    session,
    keywords: project.asoKeywords,
    countries,
    appId,
  });

  const keywords: AppKeywordMetric[] = [];
  for (const [country, rows] of Object.entries(response.results_by_country ?? {})) {
    for (const row of rows) {
      keywords.push({
        id: createId("kw"),
        projectId: project.id,
        date,
        keyword: row.keyword,
        country,
        popularityScore: row.popularity_score ?? 0,
        difficultyScore: row.difficulty_score ?? 0,
        opportunityScore: row.opportunity_score ?? 0,
        difficultyLabel: row.difficulty_label,
        classification: row.classification,
        appRank: row.app_rank ?? null,
        rawJson: row,
        createdAt,
      });
    }
  }

  return {
    result: {
      source: "aso",
      projectId: project.id,
      status: "success",
      message: `Imported ASO keyword data for ${project.asoKeywords.length} keyword(s) across ${countries.length} countr${countries.length === 1 ? "y" : "ies"}.`,
      inserted: { snapshots: 0, queries: 0, pages: 0, keywords: keywords.length },
    },
    keywords,
  };
}

type AsoSession = {
  cookie: string;
  csrfToken: string;
};

export async function createAsoSession(baseUrl = process.env.RESPECT_ASO_BASE_URL ?? DEFAULT_BASE_URL): Promise<AsoSession> {
  const response = await fetch(`${baseUrl}/`);
  if (!response.ok) {
    throw new Error(`GET / failed: ${response.status}`);
  }

  const html = await response.text();
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(/,(?=[^ ;]+=)/)
    .map((part) => part.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");

  const csrfMatch =
    html.match(/name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/) ??
    cookie.match(/csrftoken=([^;\s]+)/);
  if (!csrfMatch) {
    throw new Error("Could not read CSRF token from RespectASO response.");
  }

  return { cookie, csrfToken: csrfMatch[1] };
}

export async function searchRespectAsoKeywords(options: {
  baseUrl?: string;
  session?: AsoSession;
  keywords: string[];
  countries: string[];
  appId?: number;
  batchSize?: number;
}): Promise<AsoSearchResponse> {
  const baseUrl = options.baseUrl ?? process.env.RESPECT_ASO_BASE_URL ?? DEFAULT_BASE_URL;
  const session = options.session ?? (await createAsoSession(baseUrl));
  const countries = options.countries.slice(0, 5);
  const batchSize = options.batchSize ?? 20;
  const resultsByCountry: Record<string, AsoKeywordResult[]> = {};

  const keywords = [...new Set(options.keywords.map((keyword) => keyword.trim()).filter(Boolean))];
  for (let index = 0; index < keywords.length; index += batchSize) {
    const batch = keywords.slice(index, index + batchSize);
    const response = await searchKeywordBatch(session, baseUrl, batch, countries, options.appId);
    for (const [country, rows] of Object.entries(response.results_by_country ?? {})) {
      resultsByCountry[country] = [...(resultsByCountry[country] ?? []), ...rows];
    }
  }

  return { results_by_country: resultsByCountry };
}

async function searchKeywordBatch(
  session: AsoSession,
  baseUrl: string,
  keywords: string[],
  countries: string[],
  appId?: number,
): Promise<AsoSearchResponse> {
  const body = new FormData();
  body.set("csrfmiddlewaretoken", session.csrfToken);
  body.set("keywords", keywords.join(","));
  body.set("countries", countries.join(","));
  if (appId) body.set("app_id", String(appId));

  const response = await fetch(`${baseUrl}/search/`, {
    method: "POST",
    headers: {
      "X-CSRFToken": session.csrfToken,
      Referer: `${baseUrl}/`,
      Cookie: session.cookie,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`POST /search/ failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as AsoSearchResponse;
}

function skipped(projectId: string, message: string) {
  return {
    result: {
      source: "aso" as const,
      projectId,
      status: "skipped" as const,
      message,
      inserted: { snapshots: 0, queries: 0, pages: 0, keywords: 0 },
    },
    keywords: [],
  };
}
