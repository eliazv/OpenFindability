import { requestAscJson } from "@/lib/connectors/asc-request";

type Resource = { id: string; type: string; attributes?: Record<string, unknown> };
type Doc<T> = { data: T };

export type AscReviewInput = {
  appId: string;
  versionString: string;
  buildNumber: string;
  /** Release notes written to every localization of the version; omitted keeps the current text. */
  whatsNew?: string;
};

export type AscReviewPlan = {
  buildId: string;
  buildState?: string;
  versionId?: string;
  versionState?: string;
  releaseType: string;
  locales: string[];
  openSubmissionId?: string;
  problems: string[];
};

export type AscReviewResult = AscReviewPlan & { versionId: string; submissionId: string; submissionState?: string };

// Versions that can still be edited and submitted; anything else is live, in review or rejected-by-developer state.
const SUBMITTABLE_STATES = new Set(["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"]);

/**
 * App Store review submission over the official API (reviewSubmissions flow).
 * `request` is injectable so the sequence is testable offline; every call is a single, non-retried request.
 */
export class AscReviewClient {
  constructor(private readonly token: string, private readonly request: typeof fetch = fetch) {}

  private call<T>(path: string, init: RequestInit = {}): Promise<T> {
    return requestAscJson<T>(path, this.token, init, this.request);
  }

  async plan(input: AscReviewInput): Promise<AscReviewPlan> {
    const problems: string[] = [];
    const q = (value: string) => encodeURIComponent(value);
    const builds = await this.call<Doc<Resource[]>>(
      `/builds?filter[app]=${q(input.appId)}&filter[version]=${q(input.buildNumber)}&filter[preReleaseVersion.version]=${q(input.versionString)}&limit=5`);
    const build = builds.data[0];
    if (!build) throw new Error(`Build ${input.versionString} (${input.buildNumber}) not found in App Store Connect.`);
    const buildState = build.attributes?.processingState as string | undefined;
    if (buildState !== "VALID") problems.push(`Build processing state is ${buildState ?? "unknown"}, not VALID.`);
    if (build.attributes?.expired === true) problems.push("Build is expired.");
    if (build.attributes?.usesNonExemptEncryption === undefined || build.attributes?.usesNonExemptEncryption === null)
      problems.push("Export compliance (usesNonExemptEncryption) is not set on the build.");

    const versions = await this.call<Doc<Resource[]>>(`/apps/${q(input.appId)}/appStoreVersions?filter[platform]=IOS&limit=50`);
    const state = (v: Resource) => (v.attributes?.appVersionState ?? v.attributes?.appStoreState) as string | undefined;
    const version = versions.data.find((v) => v.attributes?.versionString === input.versionString);
    if (version && !SUBMITTABLE_STATES.has(state(version) ?? ""))
      problems.push(`Version ${input.versionString} is ${state(version)}: it cannot be submitted again; bump the marketing version.`);
    const blocking = versions.data.find((v) => v !== version && SUBMITTABLE_STATES.has(state(v) ?? ""));
    if (!version && blocking)
      problems.push(`Version ${blocking.attributes?.versionString} is still editable (${state(blocking)}): finish or remove it first.`);
    const previous = versions.data.find((v) => v !== version && state(v) === "READY_FOR_DISTRIBUTION");
    const releaseType = (version?.attributes?.releaseType ?? previous?.attributes?.releaseType ?? "AFTER_APPROVAL") as string;

    let locales: string[] = [];
    if (version) {
      const locs = await this.call<Doc<Resource[]>>(`/appStoreVersions/${q(version.id)}/appStoreVersionLocalizations`);
      locales = locs.data.map((l) => String(l.attributes?.locale));
    }
    const open = await this.call<Doc<Resource[]>>(
      `/reviewSubmissions?filter[app]=${q(input.appId)}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES`);
    const active = open.data.find((s) => s.attributes?.state !== "READY_FOR_REVIEW");
    if (active) problems.push(`Another review submission is ${active.attributes?.state}: wait for it or cancel it in App Store Connect.`);
    const draft = open.data.find((s) => s.attributes?.state === "READY_FOR_REVIEW");

    return { buildId: build.id, buildState, versionId: version?.id, versionState: version ? state(version) : undefined,
      releaseType, locales, openSubmissionId: draft?.id, problems };
  }

  /** Creates/updates the version, attaches the build, writes release notes and submits. Throws if the plan has problems. */
  async submit(input: AscReviewInput, plan: AscReviewPlan): Promise<AscReviewResult> {
    if (plan.problems.length) throw new Error("Review submission blocked:\n- " + plan.problems.join("\n- "));
    let versionId = plan.versionId;
    if (!versionId) {
      const created = await this.call<Doc<Resource>>("/appStoreVersions", { method: "POST", body: JSON.stringify({ data: {
        type: "appStoreVersions",
        attributes: { platform: "IOS", versionString: input.versionString, releaseType: plan.releaseType },
        relationships: { app: { data: { type: "apps", id: input.appId } } },
      } }) });
      versionId = created.data.id;
    }
    await this.call(`/appStoreVersions/${versionId}/relationships/build`, { method: "PATCH",
      body: JSON.stringify({ data: { type: "builds", id: plan.buildId } }) });

    const locs = await this.call<Doc<Resource[]>>(`/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
    const locales = locs.data.map((l) => String(l.attributes?.locale));
    if (input.whatsNew) {
      for (const loc of locs.data) {
        await this.call(`/appStoreVersionLocalizations/${loc.id}`, { method: "PATCH", body: JSON.stringify({ data: {
          type: "appStoreVersionLocalizations", id: loc.id, attributes: { whatsNew: input.whatsNew },
        } }) });
      }
    }

    const submissionId = plan.openSubmissionId ?? (await this.call<Doc<Resource>>("/reviewSubmissions", { method: "POST",
      body: JSON.stringify({ data: { type: "reviewSubmissions", attributes: { platform: "IOS" },
        relationships: { app: { data: { type: "apps", id: input.appId } } } } }) })).data.id;
    const items = await this.call<Doc<Resource[]>>(`/reviewSubmissions/${submissionId}/items?include=appStoreVersion&limit=50`)
      .catch(() => ({ data: [] as Resource[] }));
    const hasItem = items.data.some((item) =>
      (item as Resource & { relationships?: { appStoreVersion?: { data?: { id?: string } } } }).relationships?.appStoreVersion?.data?.id === versionId);
    if (!hasItem) {
      await this.call("/reviewSubmissionItems", { method: "POST", body: JSON.stringify({ data: { type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: submissionId } },
          appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
        } } }) });
    }
    const sent = await this.call<Doc<Resource>>(`/reviewSubmissions/${submissionId}`, { method: "PATCH",
      body: JSON.stringify({ data: { type: "reviewSubmissions", id: submissionId, attributes: { submitted: true } } }) });
    return { ...plan, versionId, locales, submissionId, submissionState: sent.data.attributes?.state as string | undefined };
  }
}
