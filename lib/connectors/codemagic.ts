import type { IosPlan, IosReleaseConfig } from "@/lib/release-ios";

/**
 * Codemagic is a separate macOS executor. No GitHub Actions workflow is
 * dispatched by this connector. Keep signing credentials in the PRIVATE
 * Codemagic runner app, never in the public OpenFindability repository.
 */
const API = "https://api.codemagic.io";
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

export type RunnerPolicyApp = {
  enabled?: boolean;
  repository?: string;
  appId?: number;
  teamId?: string;
  framework?: string;
  bundleIds?: string[];
  workingDirectory?: string;
  flutterVersion?: string;
  nodeVersion?: string;
  xcodeVersion?: string;
  approvedShas?: string[];
};

export function codemagicRunnerFromEnv(env: NodeJS.ProcessEnv = process.env): CodemagicRunner {
  const token = env.CODEMAGIC_API_TOKEN?.trim();
  const appId = env.CODEMAGIC_RUNNER_APP_ID?.trim() ?? "";
  const branch = env.CODEMAGIC_RUNNER_BRANCH?.trim() || "main";
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
  return problems;
}

/** Local copy of the private runner apps.json: catches a refused build before it starts a macOS machine. */
export function runnerPolicyProblems(plan: IosPlan, policy: Record<string, RunnerPolicyApp>): string[] {
  const app = policy[plan.slug];
  if (!app) return ["Runner policy has no entry for " + plan.slug + "."];
  const { config } = plan;
  const problems: string[] = [];
  if (app.enabled !== true) problems.push("Runner policy: app is disabled.");
  if (!app.approvedShas?.includes(plan.sha)) problems.push("Runner policy: SHA is not in approvedShas.");
  const same: [string, unknown, unknown][] = [
    ["repository", app.repository, config.repository],
    ["appId", app.appId, config.appId],
    ["teamId", app.teamId, config.teamId],
    ["framework", app.framework, config.framework],
    ["workingDirectory", app.workingDirectory ?? ".", config.workingDirectory ?? "."],
    ["bundleIds", JSON.stringify(app.bundleIds), JSON.stringify(config.bundleIds)],
    ["xcodeVersion", app.xcodeVersion, config.xcodeVersion],
    config.framework === "flutter"
      ? ["flutterVersion", app.flutterVersion, config.flutterVersion]
      : ["nodeVersion", app.nodeVersion, config.nodeVersion],
  ];
  for (const [name, runner, local] of same) {
    if (runner !== local) problems.push("Runner policy: " + name + " differs from iosReleaseConfig.");
  }
  return problems;
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
      },
      ...(Object.keys(softwareVersions).length ? { softwareVersions } : {}),
    },
  };
}

export class CodemagicClient {
  constructor(private readonly runner: CodemagicRunner, private readonly request: typeof fetch = fetch) {
    if (!APP_ID.test(runner.appId)) throw new Error("Invalid Codemagic application ID.");
  }

  private async send(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.request(API + path, {
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

  async cancelBuild(buildId: string): Promise<"cancel_requested" | "already_finished"> {
    if (!BUILD_ID.test(buildId)) throw new Error("Invalid Codemagic build ID.");
    // Codemagic returns 208 when the build is already completed. Never claim cancellation on that status.
    // The success body is undocumented, so only the status code is read.
    const response = await this.send("/builds/" + buildId + "/cancel", { method: "POST" });
    return response.status === 208 ? "already_finished" : "cancel_requested";
  }
}
