import { validateRepository } from "@/lib/connectors/github-actions";

export type IosReleaseConfig = {
  repository: string;
  appId: number;
  teamId: string;
  bundleIds: string[];
  framework: "flutter";
};
export type IosBuild = { id: string; version: string; processingState?: string; uploadedDate?: string; rawJson: unknown };
export type IosPlan = {
  slug: string; sha: string; buildName: string; buildNumber: string;
  mode: "check" | "unsigned" | "build" | "testflight"; config: IosReleaseConfig;
};

export function validateIosConfig(config: IosReleaseConfig): IosReleaseConfig {
  validateRepository(config.repository);
  if (!Number.isSafeInteger(config.appId) || config.appId < 1) throw new Error("A numeric App Store Connect appId is required.");
  if (!/^[A-Z0-9]{10}$/.test(config.teamId)) throw new Error("Apple Team ID must have 10 uppercase characters.");
  if (config.framework !== "flutter") throw new Error("Only Flutter is supported by the initial runner; Capacitor needs a separate builder.");
  if (!Array.isArray(config.bundleIds) || config.bundleIds.length === 0 || config.bundleIds.some((id) => !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(id)) || new Set(config.bundleIds).size !== config.bundleIds.length) throw new Error("Expected unique explicit bundle IDs: app first, then every extension.");
  return config;
}

/** Pure planning: caller supplies the complete paginated ASC inventory. Never writes. */
export function planIosRelease(options: {
  slug: string; config: IosReleaseConfig; sha: string; buildName: string;
  buildNumber?: string; mode?: IosPlan["mode"]; builds: IosBuild[];
}): IosPlan {
  const config = validateIosConfig(options.config);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.slug)) throw new Error("Invalid project slug.");
  if (!/^[a-f0-9]{40}$/.test(options.sha)) throw new Error("--sha requires an explicitly reviewed full 40-character commit SHA (no branch/PR refs).");
  if (!/^\d+\.\d+\.\d+$/.test(options.buildName)) throw new Error("--build-name must be a numeric x.y.z version.");
  if (options.builds.some((build) => !/^[1-9]\d*$/.test(build.version) || !Number.isSafeInteger(Number(build.version)))) throw new Error("ASC has non-integer build numbers; automatic ordering is ambiguous. Reconcile numbering before dispatch.");
  const highest = Math.max(0, ...options.builds.map((build) => Number(build.version)));
  const number = options.buildNumber && options.buildNumber !== "auto" ? options.buildNumber : String(highest + 1);
  if (!/^[1-9]\d*$/.test(number) || !Number.isSafeInteger(Number(number)) || Number(number) <= highest) throw new Error(`Build number must be an integer greater than all ASC builds (${highest}).`);
  return { slug: options.slug, config, sha: options.sha, buildName: options.buildName, buildNumber: number, mode: options.mode ?? "check" };
}

export function iosWorkflowInputs(plan: IosPlan, correlationId: string): Record<string, string> {
  if (plan.mode === "check") throw new Error("Dry-run cannot dispatch a workflow.");
  return { slug: plan.slug, sha: plan.sha, build_name: plan.buildName, build_number: plan.buildNumber, mode: plan.mode, correlation_id: correlationId };
}
