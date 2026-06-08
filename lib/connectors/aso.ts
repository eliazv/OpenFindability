import { createId } from "@/lib/id";
import { nowIso } from "@/lib/dates";
import type { AppKeywordMetric, Project, SyncResult } from "@/lib/types";

type AsoKeywordResult = {
  keyword: string;
  country: string;
  popularity_score?: number;
  difficulty_score?: number;
  opportunity_score?: number;
  difficulty_label?: string;
  classification?: string;
  app_rank?: number | null;
};

type AsoSearchResponse = {
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

  const response = await searchKeywords(session, baseUrl, project.asoKeywords, countries, project.appStoreTrackId);

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

async function createAsoSession(baseUrl: string): Promise<AsoSession> {
  const response = await fetch(`${baseUrl}/`);
  if (!response.ok) {
    throw new Error(`GET / failed: ${response.status}`);
  }

  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(/,(?=[^ ;]+=)/)
    .map((part) => part.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");

  const csrfMatch = cookie.match(/csrftoken=([^;\s]+)/);
  if (!csrfMatch) {
    throw new Error("Could not read csrftoken cookie from RespectASO response.");
  }

  return { cookie, csrfToken: csrfMatch[1] };
}

async function searchKeywords(
  session: AsoSession,
  baseUrl: string,
  keywords: string[],
  countries: string[],
  appId?: number,
): Promise<AsoSearchResponse> {
  const body = new URLSearchParams({
    keywords: keywords.slice(0, 20).join(","),
    countries: countries.slice(0, 5).join(","),
  });
  if (appId) {
    body.set("app_id", String(appId));
  }

  const response = await fetch(`${baseUrl}/search/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-CSRFToken": session.csrfToken,
      Referer: `${baseUrl}/`,
      Cookie: session.cookie,
    },
    body: body.toString(),
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
