import { validateRepository } from "@/lib/connectors/github-actions";

export type IosReleaseConfig = {
  repository: string;
  appId: number;
  teamId: string;
  bundleIds: string[];
  framework: "flutter" | "capacitor";
  workingDirectory?: string;
  /** Optional Codemagic software selection, pinned per app (also checked in private runner). */
  flutterVersion?: string;
  nodeVersion?: string;
  xcodeVersion?: string;
  /** Native build details written by ios-setup and sent to the runner with each Codemagic build. */
  scheme?: string;
  targets?: Record<string, string>;
  webBuildScript?: string;
  /** Overrides the Firebase pods version when a FlutterFire release asks for one that was not published. */
  firebaseSdkVersion?: string;
  xcodeProject?: string;
  workspace?: string;
  requiredEntitlements?: Record<string, Record<string, unknown>>;
};
export type IosBuild = { id: string; version: string; processingState?: string; uploadedDate?: string; rawJson: unknown };
export type IosPlan = {
  slug: string; sha: string; buildName: string; buildNumber: string;
  mode: "check" | "unsigned" | "build" | "testflight"; config: IosReleaseConfig;
  /** The runner resolves native pods again instead of enforcing a Podfile.lock older than the dependencies. */
  refreshPods?: boolean;
};

export function validateIosConfig(config: IosReleaseConfig): IosReleaseConfig {
  validateRepository(config.repository);
  if (!Number.isSafeInteger(config.appId) || config.appId < 1) throw new Error("A numeric App Store Connect appId is required.");
  if (!/^[A-Z0-9]{10}$/.test(config.teamId)) throw new Error("Apple Team ID must have 10 uppercase characters.");
  if (!["flutter", "capacitor"].includes(config.framework)) throw new Error("Supported iOS frameworks: flutter, capacitor.");
  if (config.workingDirectory !== undefined && config.workingDirectory !== "." && !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(config.workingDirectory)) throw new Error("workingDirectory must be a safe relative app folder.");
  if (!Array.isArray(config.bundleIds) || config.bundleIds.length === 0 || config.bundleIds.some((id) => !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(id)) || new Set(config.bundleIds).size !== config.bundleIds.length) throw new Error("Expected unique explicit bundle IDs: app first, then every extension.");
  if (config.flutterVersion !== undefined && !/^\d+\.\d+\.\d+$/.test(config.flutterVersion)) throw new Error("Invalid Flutter version.");
  if (config.nodeVersion !== undefined && !/^\d+\.\d+\.\d+$/.test(config.nodeVersion)) throw new Error("Invalid Node version.");
  if (config.firebaseSdkVersion !== undefined && !/^\d+\.\d+\.\d+$/.test(config.firebaseSdkVersion)) throw new Error("Invalid Firebase SDK version.");
  if (config.xcodeVersion !== undefined && !/^\d+\.\d+(?:\.\d+)?$/.test(config.xcodeVersion)) throw new Error("Invalid Xcode version.");
  return config;
}

/** Pure planning: caller supplies the complete paginated ASC inventory. Never writes. */
export function planIosRelease(options: {
  slug: string; config: IosReleaseConfig; sha: string; buildName: string;
  buildNumber?: string; mode?: IosPlan["mode"]; builds: IosBuild[]; refreshPods?: boolean;
}): IosPlan {
  const config = validateIosConfig(options.config);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.slug)) throw new Error("Invalid project slug.");
  if (!/^[a-f0-9]{40}$/.test(options.sha)) throw new Error("--sha requires an explicitly reviewed full 40-character commit SHA (no branch/PR refs).");
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(options.buildName)) throw new Error("--build-name must be a numeric x.y or x.y.z version.");
  if (options.builds.some((build) => !/^[1-9]\d*$/.test(build.version) || !Number.isSafeInteger(Number(build.version)))) throw new Error("ASC has non-integer build numbers; automatic ordering is ambiguous. Reconcile numbering before dispatch.");
  const highest = Math.max(0, ...options.builds.map((build) => Number(build.version)));
  const number = options.buildNumber && options.buildNumber !== "auto" ? options.buildNumber : String(highest + 1);
  if (!/^[1-9]\d*$/.test(number) || !Number.isSafeInteger(Number(number)) || Number(number) <= highest) throw new Error(`Build number must be an integer greater than all ASC builds (${highest}).`);
  return { slug: options.slug, config, sha: options.sha, buildName: options.buildName, buildNumber: number, mode: options.mode ?? "check", refreshPods: options.refreshPods ?? false };
}

export function iosWorkflowInputs(plan: IosPlan, correlationId: string): Record<string, string> {
  if (plan.mode === "check") throw new Error("Dry-run cannot dispatch a workflow.");
  return { slug: plan.slug, sha: plan.sha, build_name: plan.buildName, build_number: plan.buildNumber, mode: plan.mode, correlation_id: correlationId };
}
