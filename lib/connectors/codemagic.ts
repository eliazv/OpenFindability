import type { IosPlan, IosReleaseConfig } from "@/lib/release-ios";

/**
 * Codemagic is a separate macOS executor. No GitHub Actions workflow is
 * dispatched by this connector. Signing credentials live in Codemagic
 * variable groups, never in this public repository.
 */
const API = "https://api.codemagic.io";
const API_V3 = "https://codemagic.io/api/v3";
const BUILD_ID = /^[a-f0-9]{24}$/i;
const APP_ID = /^[a-f0-9]{24}$/i;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export type CodemagicRunner = {
  token: string;
  appId: string;
  branch: string;
  instanceType: "mac_mini_m2" | "mac_mini_m4";
};

export type CodemagicBuild = {
  buildId: string;
  status: string;
  workflowId?: string;
  createdAt?: string;
  finishedAt?: string;
  publishingStatus?: string;
  url: string;
};

export function codemagicRunnerFromEnv(env: NodeJS.ProcessEnv = process.env): CodemagicRunner {
  const token = env.CODEMAGIC_API_TOKEN?.trim();
  const appId = env.CODEMAGIC_RUNNER_APP_ID?.trim() ?? "";
  const branch = env.CODEMAGIC_RUNNER_BRANCH?.trim() || "master";
  const instanceType = env.CODEMAGIC_INSTANCE_TYPE?.trim() || "mac_mini_m2";
  if (!token) throw new Error("CODEMAGIC_API_TOKEN is required (Codemagic Account settings).");
  if (!APP_ID.test(appId)) throw new Error("CODEMAGIC_RUNNER_APP_ID must be a 24-character Codemagic app ID.");
  if (!BRANCH.test(branch) || branch.includes("..") || branch.includes("//") || branch.endsWith("/"))
    throw new Error("Unsafe CODEMAGIC_RUNNER_BRANCH.");
  if (!["mac_mini_m2", "mac_mini_m4"].includes(instanceType))
    throw new Error("CODEMAGIC_INSTANCE_TYPE must be mac_mini_m2 or mac_mini_m4.");
  return { token, appId, branch, instanceType: instanceType as CodemagicRunner["instanceType"] };
}

/** Without these pins Codemagic uses its YAML defaults and the runner toolchain check fails the build. */
export function codemagicPinProblems(config: IosReleaseConfig): string[] {
  const problems: string[] = [];
  if (!config.xcodeVersion) problems.push("iosReleaseConfig.xcodeVersion is required for Codemagic.");
  if (config.framework === "flutter" && !config.flutterVersion) problems.push("iosReleaseConfig.flutterVersion is required for Codemagic.");
  if (config.framework === "capacitor" && !config.nodeVersion) problems.push("iosReleaseConfig.nodeVersion is required for Codemagic.");
  if (!config.scheme || !config.targets) problems.push("iosReleaseConfig has no native targets: run ios-setup for this app.");
  return problems;
}

/**
 * The runner's validate.py checks this before running app code. The release command is the
 * approval: the SHA was shown by the dry run and accepted with --build or --apply.
 */
export function runnerPolicy(plan: IosPlan): string {
  const app = { ...plan.config, workingDirectory: plan.config.workingDirectory ?? ".", enabled: true, approvedShas: [plan.sha] };
  return Buffer.from(JSON.stringify({ [plan.slug]: app })).toString("base64");
}

export function codemagicBuildRequest(plan: IosPlan, correlationId: string, runner: CodemagicRunner) {
  if (plan.mode === "check") throw new Error("Preflight cannot start a paid build.");
  if (!/^[a-f0-9-]{36}$/i.test(correlationId)) throw new Error("Invalid correlation ID.");
  const pinProblems = codemagicPinProblems(plan.config);
  if (pinProblems.length) throw new Error(pinProblems.join(" "));
  const softwareVersions: Record<string, string> = {};
  if (plan.config.xcodeVersion) softwareVersions.xcode = plan.config.xcodeVersion;
  if (plan.config.framework === "flutter" && plan.config.flutterVersion)
    softwareVersions.flutter = plan.config.flutterVersion;
  if (plan.config.framework === "capacitor" && plan.config.nodeVersion)
    softwareVersions.node = plan.config.nodeVersion;
  return {
    appId: runner.appId,
    workflowId: plan.mode === "unsigned" ? "ios-central-unsigned" : "ios-central-signed",
    branch: runner.branch,
    instanceType: runner.instanceType,
    environment: {
      variables: {
        SLUG: plan.slug,
        SHA: plan.sha,
        MODE: plan.mode,
        BUILD_NAME: plan.buildName,
        BUILD_NUMBER: plan.buildNumber,
        CORRELATION_ID: correlationId,
        RUNNER_APPS_B64: runnerPolicy(plan),
        REFRESH_PODS: plan.refreshPods ? "1" : "0",
      },
      ...(Object.keys(softwareVersions).length ? { softwareVersions } : {}),
    },
  };
}

/** Keeps the root cause of a step log; stack frames and download noise are dropped. */
export function failureLines(log: string, limit = 25): string[] {
  const lines = log.replace(/<[^>]+>/g, "").split("\n").filter((line) => !/gems\/|rubygems|CDN: trunk/.test(line));
  // "[!]" can be a CocoaPods warning, so a traceback or reported build failure wins, then the last "[!]".
  const reported = lines.findLastIndex((line) => /Traceback|Failed to build|Error \(Xcode\)|Target Integrity \(Xcode\)/.test(line));
  const start = reported >= 0 ? reported : lines.findLastIndex((line) => /\[!\]|\berror\b:|\bfatal\b|Failed to /i.test(line));
  // A failed Xcode script phase prints its cause just above, after pages of compiler warnings.
  const phase = lines.findLastIndex((line) => /Target \S+ failed:|Command \w+ failed with a nonzero exit code/.test(line));
  if (phase >= 0) return lines.slice(Math.max(0, phase - 2), phase + 3).map((line) => line.trimEnd().slice(0, 300));
  const selected = start < 0 ? lines.slice(-limit) : lines.slice(start);
  return [...new Set(selected.map((line) => line.trimEnd().slice(0, 300)))].slice(0, limit);
}

const FINAL_STATUSES = ["finished", "failed", "canceled", "timeout", "skipped"];

/** Starts the upload-only workflow for an IPA already built and published as an artifact. */
export function codemagicUploadRequest(plan: IosPlan, correlationId: string, runner: CodemagicRunner, ipaUrl: string) {
  const request = codemagicBuildRequest(plan, correlationId, runner);
  return { ...request, workflowId: "ios-central-upload",
    environment: { ...request.environment, variables: { ...request.environment.variables, IPA_URL: ipaUrl } } };
}

export class CodemagicClient {
  constructor(private readonly runner: CodemagicRunner, private readonly request: typeof fetch = fetch) {
    if (!APP_ID.test(runner.appId)) throw new Error("Invalid Codemagic application ID.");
  }

  private async send(path: string, init: RequestInit = {}, base = API): Promise<Response> {
    const response = await this.request(base + path, {
      ...init,
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
        "x-auth-token": this.runner.token,
      },
    });
    // Never print response bodies: providers can return request parameters.
    if (!response.ok) throw new Error("Codemagic API " + response.status + " (" + (init.method ?? "GET") + " " + path + ")");
    return response;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.send(path, init);
    if (response.status === 204 || response.status === 208) return undefined as T;
    return await response.json() as T;
  }

  /** Do not automatically retry: timeout may have dispatched a paid macOS build. */
  async dispatch(plan: IosPlan, correlationId: string): Promise<{ buildId: string }> {
    const body = codemagicBuildRequest(plan, correlationId, this.runner);
    const response = await this.call<{ buildId?: string }>("/builds", {
      method: "POST", body: JSON.stringify(body),
    });
    if (!response || typeof response.buildId !== "string" || !BUILD_ID.test(response.buildId))
      throw new Error("Codemagic accepted an ambiguous build response; inspect Codemagic before retrying.");
    return { buildId: response.buildId };
  }

  private async artifactPath(buildId: string, name: string): Promise<string> {
    if (!BUILD_ID.test(buildId)) throw new Error("Invalid Codemagic build ID.");
    const response = await this.call<{ build?: { artefacts?: { name?: string; url?: string }[] } }>("/builds/" + buildId);
    const url = response?.build?.artefacts?.find((artifact) => artifact.name === name)?.url;
    if (!url?.startsWith(API + "/artifacts/")) throw new Error("Build " + buildId + " has no " + name + " artifact.");
    return url.slice(API.length);
  }

  /** Version, build number and SHA recorded by the runner when it produced the IPA. */
  async releaseReceipt(buildId: string): Promise<{ sha: string; version: string; build: string }> {
    return await (await this.send(await this.artifactPath(buildId, "release.json"))).json() as { sha: string; version: string; build: string };
  }

  /** Same no-retry rule as dispatch. The temporary IPA link is valid for one hour. */
  async dispatchUpload(plan: IosPlan, correlationId: string, sourceBuildId: string): Promise<{ buildId: string }> {
    const path = await this.artifactPath(sourceBuildId, "release.ipa");
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const { url } = await (await this.send(path + "/public-url", { method: "POST", body: JSON.stringify({ expiresAt }) })).json() as { url: string };
    const response = await this.call<{ buildId?: string }>("/builds", {
      method: "POST", body: JSON.stringify(codemagicUploadRequest(plan, correlationId, this.runner, url)),
    });
    if (!response || typeof response.buildId !== "string" || !BUILD_ID.test(response.buildId))
      throw new Error("Codemagic accepted an ambiguous build response; inspect Codemagic before retrying.");
    return { buildId: response.buildId };
  }

  async getBuild(buildId: string): Promise<CodemagicBuild> {
    if (!BUILD_ID.test(buildId)) throw new Error("Invalid Codemagic build ID.");
    const response = await this.call<{ build?: Record<string, unknown> }>("/builds/" + buildId);
    if (!response?.build) throw new Error("Codemagic did not return build details.");
    const build = response.build;
    const actions = Array.isArray(build.buildActions) ? build.buildActions : [];
    const publishing = actions.find((action) =>
      action && typeof action === "object" && (action as { type?: string }).type === "publishing"
    ) as { status?: string } | undefined;
    const field = (name: string): string | undefined => typeof build[name] === "string" ? build[name] as string : undefined;
    return {
      buildId,
      status: field("status") ?? "unknown",
      workflowId: field("workflowId"),
      createdAt: field("createdAt") ?? field("startedAt"),
      finishedAt: field("finishedAt"),
      publishingStatus: publishing?.status,
      url: "https://codemagic.io/app/" + this.runner.appId + "/build/" + buildId,
    };
  }

  private async listAll<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; ; page++) {
      const response = await this.send(path + "?page=" + page, {}, API_V3);
      const body = await response.json() as { data: T[]; total_pages: number };
      items.push(...body.data);
      if (page >= body.total_pages) return items;
    }
  }

  async ensureVariableGroup(name: string): Promise<string> {
    const path = "/apps/" + this.runner.appId + "/variable-groups";
    const existing = (await this.listAll<{ id: string; name: string }>(path)).find((group) => group.name === name);
    if (existing) return existing.id;
    const response = await this.send(path, { method: "POST", body: JSON.stringify({ name }) }, API_V3);
    return (await response.json() as { data: { id: string } }).data.id;
  }

  async listVariableNames(groupId: string): Promise<string[]> {
    return (await this.listAll<{ name: string }>("/variable-groups/" + groupId + "/variables")).map((variable) => variable.name);
  }

  /** Values are write-only: they are never read back, printed or logged. */
  async addSecrets(groupId: string, variables: { name: string; value: string }[]): Promise<void> {
    if (!variables.length) return;
    await this.send("/variable-groups/" + groupId + "/variables",
      { method: "POST", body: JSON.stringify({ secure: true, variables }) }, API_V3);
  }

  /** The failed step and the error lines of its log, so a failure can be read without opening Codemagic. */
  async failureSummary(buildId: string): Promise<string> {
    if (!BUILD_ID.test(buildId)) throw new Error("Invalid Codemagic build ID.");
    const response = await this.call<{ build?: { message?: string; buildActions?: { status?: string; logUrl?: string; subactions?: { logUrl?: string }[] }[] } }>("/builds/" + buildId);
    const failed = response?.build?.buildActions?.find((action) => action.status === "failed");
    const logUrl = failed?.subactions?.[0]?.logUrl ?? failed?.logUrl;
    const message = response?.build?.message ?? "Build failed.";
    if (!logUrl?.startsWith(API + "/")) return message;
    const log = await (await this.send(logUrl.slice(API.length))).text();
    return [message, ...failureLines(log)].join("\n");
  }

  /** Read-only polling; stops at a final status or when the limit passes, leaving the build running. */
  async waitForBuild(buildId: string, options: { intervalMs?: number; limitMs?: number; onStatus?: (status: string) => void } = {}): Promise<CodemagicBuild> {
    const { intervalMs = 60_000, limitMs = 2 * 60 * 60_000, onStatus } = options;
    const deadline = Date.now() + limitMs;
    let last = "";
    for (;;) {
      const build = await this.getBuild(buildId);
      if (build.status !== last) onStatus?.(build.status);
      last = build.status;
      if (FINAL_STATUSES.includes(build.status) || Date.now() >= deadline) return build;
      await new Promise((done) => setTimeout(done, intervalMs));
    }
  }

  async cancelBuild(buildId: string): Promise<"cancel_requested" | "already_finished"> {
    if (!BUILD_ID.test(buildId)) throw new Error("Invalid Codemagic build ID.");
    // Codemagic returns 208 when the build is already completed. Never claim cancellation on that status.
    // The success body is undocumented, so only the status code is read.
    const response = await this.send("/builds/" + buildId + "/cancel", { method: "POST" });
    return response.status === 208 ? "already_finished" : "cancel_requested";
  }
}
