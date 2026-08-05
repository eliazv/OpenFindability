import { readFile } from "node:fs/promises";
import { createSign } from "node:crypto";

const API_BASE = "https://api.appstoreconnect.apple.com/v1";
const TOKEN_TTL_SECONDS = 19 * 60; // Apple allows up to 20 minutes; refresh a minute early.

// Versions in these states are not yet live/submitted, so metadata writes only ever target them.
const EDITABLE_VERSION_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
]);

type JsonApiResource = { id: string; type: string; attributes?: Record<string, unknown> };
type JsonApiDocument = { data: JsonApiResource };
type JsonApiListDocument = { data: JsonApiResource[]; links?: { next?: string } };

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function loadPrivateKey(): Promise<string> {
  const keyPath = process.env.ASC_PRIVATE_KEY_PATH?.trim();
  if (!keyPath) throw new Error("ASC_PRIVATE_KEY_PATH is not set.");
  return readFile(keyPath, "utf8");
}

// ES256 JWT signed with node:crypto only — no jsonwebtoken dependency needed.
// `dsaEncoding: "ieee-p1363"` makes Node emit the raw r||s signature JOSE/ES256 requires,
// instead of the DER-encoded signature crypto.sign() produces by default.
export async function getAscToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const issuerId = process.env.ASC_ISSUER_ID?.trim();
  const keyId = process.env.ASC_KEY_ID?.trim();
  if (!issuerId || !keyId) {
    throw new Error("ASC_ISSUER_ID and ASC_KEY_ID must be set in .env.");
  }

  const privateKey = await loadPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = { iss: issuerId, iat: now, exp: now + TOKEN_TTL_SECONDS, aud: "appstoreconnect-v1" };

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = createSign("sha256")
    .update(signingInput)
    .sign({ key: privateKey, dsaEncoding: "ieee-p1363" });

  const token = `${signingInput}.${base64Url(signature)}`;
  cachedToken = { token, expiresAt: (now + TOKEN_TTL_SECONDS - 60) * 1000 };
  return token;
}

async function ascFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAscToken();
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail = (body as { errors?: { title?: string; detail?: string }[] } | undefined)?.errors
      ?.map((e) => e.detail ?? e.title)
      .filter(Boolean)
      .join("; ");
    throw new Error(`App Store Connect API ${response.status} on ${path}${detail ? `: ${detail}` : ""}`);
  }
  return body as T;
}

async function ascFetchAllPages(path: string): Promise<JsonApiResource[]> {
  const results: JsonApiResource[] = [];
  let next: string | undefined = path;
  while (next) {
    const page: JsonApiListDocument = await ascFetch<JsonApiListDocument>(next);
    results.push(...page.data);
    next = page.links?.next;
  }
  return results;
}

export type AscApp = { id: string; bundleId?: string; name?: string; sku?: string; primaryLocale?: string };

export async function listAscApps(): Promise<AscApp[]> {
  const apps = await ascFetchAllPages("/apps?limit=200");
  return apps.map((app) => ({
    id: app.id,
    bundleId: app.attributes?.bundleId as string | undefined,
    name: app.attributes?.name as string | undefined,
    sku: app.attributes?.sku as string | undefined,
    primaryLocale: app.attributes?.primaryLocale as string | undefined,
  }));
}

export type AscAppInfoLocalization = {
  id: string;
  locale: string;
  name?: string;
  subtitle?: string;
  privacyPolicyUrl?: string;
};

export async function getAppInfoLocalizations(appId: string): Promise<AscAppInfoLocalization[]> {
  const appInfos = await ascFetchAllPages(`/apps/${appId}/appInfos`);
  // Apple keeps historical appInfo resources around; the editable one has no `appStoreState`
  // terminal-state marker set yet (or is in a pre-review state) — take the first (Apple returns
  // the current one first in practice) but fall back to all of them if that assumption is wrong.
  const appInfoId = appInfos[0]?.id;
  if (!appInfoId) return [];

  const localizations = await ascFetchAllPages(`/appInfos/${appInfoId}/appInfoLocalizations`);
  return localizations.map((loc) => ({
    id: loc.id,
    locale: loc.attributes?.locale as string,
    name: loc.attributes?.name as string | undefined,
    subtitle: loc.attributes?.subtitle as string | undefined,
    privacyPolicyUrl: loc.attributes?.privacyPolicyUrl as string | undefined,
  }));
}

export async function updateAppInfoLocalization(
  localizationId: string,
  fields: { name?: string; subtitle?: string },
): Promise<void> {
  await ascFetch(`/appInfoLocalizations/${localizationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: { type: "appInfoLocalizations", id: localizationId, attributes: fields },
    }),
  });
}

export type AscAppStoreVersion = { id: string; versionString?: string; state: string; platform?: string };

export async function getEditableAppStoreVersion(appId: string): Promise<AscAppStoreVersion | null> {
  const versions = await ascFetchAllPages(`/apps/${appId}/appStoreVersions?limit=50`);
  for (const version of versions) {
    const state = (version.attributes?.appVersionState ?? version.attributes?.appStoreState) as string | undefined;
    if (state && EDITABLE_VERSION_STATES.has(state)) {
      return {
        id: version.id,
        versionString: version.attributes?.versionString as string | undefined,
        state,
        platform: version.attributes?.platform as string | undefined,
      };
    }
  }
  return null;
}

export type AscVersionLocalization = {
  id: string;
  locale: string;
  description?: string;
  keywords?: string;
  promotionalText?: string;
  whatsNew?: string;
  marketingUrl?: string;
  supportUrl?: string;
};

export async function getAppStoreVersionLocalizations(versionId: string): Promise<AscVersionLocalization[]> {
  const localizations = await ascFetchAllPages(`/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
  return localizations.map((loc) => ({
    id: loc.id,
    locale: loc.attributes?.locale as string,
    description: loc.attributes?.description as string | undefined,
    keywords: loc.attributes?.keywords as string | undefined,
    promotionalText: loc.attributes?.promotionalText as string | undefined,
    whatsNew: loc.attributes?.whatsNew as string | undefined,
    marketingUrl: loc.attributes?.marketingUrl as string | undefined,
    supportUrl: loc.attributes?.supportUrl as string | undefined,
  }));
}

export async function updateAppStoreVersionLocalization(
  localizationId: string,
  fields: { description?: string; keywords?: string; promotionalText?: string; whatsNew?: string },
): Promise<void> {
  await ascFetch(`/appStoreVersionLocalizations/${localizationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: { type: "appStoreVersionLocalizations", id: localizationId, attributes: fields },
    }),
  });
}

// --- Product Page Optimization (icon/screenshots/app previews A/B tests) ---
// Apple has no simple "results/conversion rate" field on these resources — winners/metrics are
// only shown in the App Store Connect UI (App Analytics). This connector can list/create
// experiments and treatment shells, not read performance numbers.

export type AscExperimentRow = {
  id: string;
  name: string;
  state: string;
  elementType?: string;
  rawJson: unknown;
};

export async function listExperiments(appId: string): Promise<AscExperimentRow[]> {
  const experiments = await ascFetchAllPages(`/apps/${appId}/appStoreVersionExperimentsV2?limit=50`);
  return experiments.map((exp) => ({
    id: exp.id,
    name: (exp.attributes?.name as string | undefined) ?? "(unnamed)",
    state: (exp.attributes?.state as string | undefined) ?? "UNKNOWN",
    elementType: exp.attributes?.type as string | undefined,
    rawJson: exp,
  }));
}

export type AscExperimentTreatmentRow = { id: string; name: string; state?: string; rawJson: unknown };

export async function getExperimentTreatments(experimentId: string): Promise<AscExperimentTreatmentRow[]> {
  const treatments = await ascFetchAllPages(
    `/appStoreVersionExperimentsV2/${experimentId}/appStoreVersionExperimentTreatments`,
  );
  return treatments.map((t) => ({
    id: t.id,
    name: (t.attributes?.name as string | undefined) ?? "(unnamed)",
    state: t.attributes?.state as string | undefined,
    rawJson: t,
  }));
}

// Best-effort per Apple's published resource shape. If Apple rejects the relationship payload,
// the thrown error carries Apple's own message — adjust the `relationships` body from that,
// rather than guessing further without a live response to react to.
export async function createExperiment(appId: string, versionId: string, name: string): Promise<AscExperimentRow> {
  const doc = await ascFetch<JsonApiDocument>("/appStoreVersionExperimentsV2", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersionExperimentsV2",
        attributes: { name },
        relationships: {
          app: { data: { type: "apps", id: appId } },
          appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
        },
      },
    }),
  });
  return {
    id: doc.data.id,
    name: (doc.data.attributes?.name as string | undefined) ?? name,
    state: (doc.data.attributes?.state as string | undefined) ?? "UNKNOWN",
    elementType: doc.data.attributes?.type as string | undefined,
    rawJson: doc.data,
  };
}

export async function createExperimentTreatment(
  experimentId: string,
  name: string,
): Promise<AscExperimentTreatmentRow> {
  const doc = await ascFetch<JsonApiDocument>("/appStoreVersionExperimentTreatments", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersionExperimentTreatments",
        attributes: { name },
        relationships: {
          experiment: { data: { type: "appStoreVersionExperimentsV2", id: experimentId } },
        },
      },
    }),
  });
  return {
    id: doc.data.id,
    name: (doc.data.attributes?.name as string | undefined) ?? name,
    state: doc.data.attributes?.state as string | undefined,
    rawJson: doc.data,
  };
}
