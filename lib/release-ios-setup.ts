import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { LocalIosProject } from "@/lib/release-ios-project";
import { validateIosConfig, type IosReleaseConfig } from "@/lib/release-ios";

const run = promisify(execFile);

/** Used when the app declares no Xcode version. Must exist on the Codemagic machines. */
export const DEFAULT_XCODE_VERSION = "27.0";

export type NativeTarget = { name: string; productType: string; bundleId?: string; entitlements?: string; team?: string; marketingVersion?: string };
export type Overrides = { xcode?: string; flutter?: string; node?: string; webBuildScript?: string };

const SHIPPED_PRODUCTS = ["com.apple.product-type.application", "com.apple.product-type.app-extension"];

function unquote(value: string | undefined): string | undefined {
  return value?.trim().replace(/^"|"$/g, "");
}

function setting(block: string, name: string): string | undefined {
  return unquote(new RegExp("\\b" + name + "\\s*=\\s*([^;]+);").exec(block)?.[1]);
}

/** Objects of one pbxproj section by ID. Reads the text only: nothing in the app runs. */
function section(source: string, isa: string): Map<string, string> {
  const body = new RegExp("/\\* Begin " + isa + " section \\*/([\\s\\S]*?)/\\* End " + isa + " section \\*/").exec(source)?.[1] ?? "";
  // The closing brace must match the object's indentation: buildSettings nests its own.
  return new Map([...body.matchAll(/^([\t ]*)([A-F0-9]{24})\b[^\n]*= \{\r?\n([\s\S]*?)^\1\};/gm)].map((match) => [match[2], match[3]]));
}

/** App and extension targets with their Release settings; test targets are left out. */
export function parseNativeTargets(pbxproj: string): NativeTarget[] {
  const lists = section(pbxproj, "XCConfigurationList");
  const configurations = section(pbxproj, "XCBuildConfiguration");
  const targets: NativeTarget[] = [];
  for (const block of section(pbxproj, "PBXNativeTarget").values()) {
    const name = setting(block, "name");
    const productType = setting(block, "productType");
    if (!name || !productType || !SHIPPED_PRODUCTS.includes(productType)) continue;
    const listId = /buildConfigurationList = ([A-F0-9]{24})/.exec(block)?.[1];
    const ids = /buildConfigurations = \(([\s\S]*?)\)/.exec(lists.get(listId ?? "") ?? "")?.[1] ?? "";
    const release = [...ids.matchAll(/[A-F0-9]{24}/g)].map((id) => configurations.get(id[0]) ?? "")
      .find((configuration) => setting(configuration, "name") === "Release") ?? "";
    targets.push({ name, productType, bundleId: setting(release, "PRODUCT_BUNDLE_IDENTIFIER"),
      entitlements: setting(release, "CODE_SIGN_ENTITLEMENTS"), team: setting(release, "DEVELOPMENT_TEAM"),
      marketingVersion: setting(release, "MARKETING_VERSION") });
  }
  return targets.sort((a, b) => Number(b.productType.endsWith(".application")) - Number(a.productType.endsWith(".application")));
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Entitlements the signed build must carry. Development push becomes production on App Store builds. */
export function parseEntitlements(plist: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const match of plist.matchAll(/<key>([^<]+)<\/key>\s*(<string>([^<]*)<\/string>|<true\/>|<false\/>|<array\/>|<array>([\s\S]*?)<\/array>)/g)) {
    const [, key, raw, text, items] = match;
    if (text !== undefined) result[key] = decodeXml(text);
    else if (raw === "<true/>") result[key] = true;
    else if (raw === "<false/>") result[key] = false;
    else result[key] = [...(items ?? "").matchAll(/<string>([^<]*)<\/string>/g)].map((item) => decodeXml(item[1]));
  }
  if ("aps-environment" in result) result["aps-environment"] = "production";
  return result;
}

function exactVersion(value: string | undefined): string | undefined {
  const version = value?.trim().replace(/^v/, "");
  return version && /^\d+\.\d+\.\d+$/.test(version) ? version : undefined;
}

async function optional(path: string): Promise<string | undefined> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

async function workflowText(gitRoot: string): Promise<string> {
  const directory = join(gitRoot, ".github", "workflows");
  const names = await readdir(directory).catch(() => [] as string[]);
  return (await Promise.all(names.map((name) => readFile(join(directory, name), "utf8")))).join("\n");
}

async function flutterVersion(appPath: string, gitRoot: string, workflows: string): Promise<string | undefined> {
  for (const directory of [appPath, gitRoot]) {
    const fvm = await optional(join(directory, ".fvmrc"));
    const pinned = fvm ? exactVersion(/"flutter"\s*:\s*"([^"]+)"/.exec(fvm)?.[1]) : undefined;
    if (pinned) return pinned;
  }
  const fromWorkflow = exactVersion(/flutter-version:\s*['"]?([0-9.]+)/.exec(workflows)?.[1]);
  if (fromWorkflow) return fromWorkflow;
  try {
    // Last resort: the SDK this machine would use to build the app. The plan shows the value before saving.
    const { stdout } = await run("flutter", ["--version", "--machine"], { shell: true, timeout: 60_000 });
    return exactVersion(JSON.parse(stdout).frameworkVersion);
  } catch { return undefined; }
}

async function nodeVersion(appPath: string, gitRoot: string, workflows: string): Promise<string | undefined> {
  const nvm = (await optional(join(appPath, ".nvmrc"))) ?? (await optional(join(gitRoot, ".nvmrc")));
  return exactVersion(nvm) ?? exactVersion(/node-version:\s*['"]?([0-9.]+)/.exec(workflows)?.[1]);
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await run("git", ["-C", cwd, ...args], { timeout: 60_000 })).stdout.trim();
}

function repositoryFromRemote(url: string): string {
  const match = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url.trim());
  if (!match) throw new Error("The origin remote is not a GitHub repository.");
  return match[1];
}

/** Builds the full release config from the app folder, so adding an app needs no hand-written JSON. */
export async function buildIosConfig(local: LocalIosProject, appId: number, overrides: Overrides = {}): Promise<IosReleaseConfig> {
  const native = local.framework === "flutter" ? "ios/Runner.xcodeproj" : "ios/App/App.xcodeproj";
  const pbxproj = await readFile(join(local.path, native, "project.pbxproj"), "utf8");
  const targets = parseNativeTargets(pbxproj);
  const main = targets[0];
  if (!main?.productType.endsWith(".application") || targets.some((target) => !target.bundleId))
    throw new Error("Could not read the app target and bundle IDs from the Xcode project.");
  if (!main.team) throw new Error("DEVELOPMENT_TEAM is not set on the Release app target.");

  const requiredEntitlements: Record<string, Record<string, unknown>> = {};
  for (const target of targets) {
    if (!target.entitlements) continue;
    const plist = await readFile(join(local.path, dirname(native), target.entitlements), "utf8");
    const entitlements = parseEntitlements(plist);
    if (Object.keys(entitlements).length) requiredEntitlements[target.bundleId!] = entitlements;
  }

  const gitRoot = resolve(await git(local.path, "rev-parse", "--show-toplevel"));
  const workflows = await workflowText(gitRoot);
  const xcode = overrides.xcode ?? /Xcode_(\d+(?:\.\d+)+)/.exec(workflows)?.[1] ?? DEFAULT_XCODE_VERSION;
  const directory = relative(gitRoot, resolve(local.path)).split(sep).join("/");
  const config: IosReleaseConfig = {
    repository: repositoryFromRemote(await git(local.path, "remote", "get-url", "origin")),
    appId, teamId: main.team, bundleIds: targets.map((target) => target.bundleId!), framework: local.framework,
    workingDirectory: directory || ".", xcodeVersion: xcode,
    scheme: local.framework === "flutter" ? "Runner" : "App",
    targets: Object.fromEntries(targets.map((target) => [target.name, target.bundleId!])),
    requiredEntitlements,
  };
  if (local.framework === "flutter") {
    config.flutterVersion = overrides.flutter ?? await flutterVersion(local.path, gitRoot, workflows);
    if (!config.flutterVersion) throw new Error("Could not find the Flutter version: pass --flutter x.y.z.");
  } else {
    config.nodeVersion = overrides.node ?? await nodeVersion(local.path, gitRoot, workflows);
    if (!config.nodeVersion) throw new Error("Could not find the Node version: pass --node x.y.z.");
    config.webBuildScript = overrides.webBuildScript ?? "build";
    config.xcodeProject = "ios/App/App.xcodeproj";
    config.workspace = "ios/App/App.xcworkspace";
  }
  return validateIosConfig(config);
}

/** Only code already on GitHub can be built, so a clean pushed HEAD is the commit to release. */
export async function resolvePushedSha(path: string, repository: string): Promise<string> {
  if (repositoryFromRemote(await git(path, "remote", "get-url", "origin")).toLowerCase() !== repository.toLowerCase())
    throw new Error("The folder's origin remote is not the configured repository " + repository + ".");
  if (await git(path, "status", "--porcelain")) throw new Error("Uncommitted changes at --path: commit and push them, or pass --sha.");
  const branch = await git(path, "branch", "--show-current");
  if (!branch) throw new Error("Detached HEAD at --path: pass --sha.");
  const head = await git(path, "rev-parse", "HEAD");
  const remote = (await git(path, "ls-remote", "origin", "refs/heads/" + branch)).split(/\s/)[0];
  if (remote !== head) throw new Error("Branch " + branch + " is not in sync with GitHub: push or pull it, or pass --sha.");
  return head;
}

/** Marketing version in the app folder, used when --build-name is omitted. */
export async function localMarketingVersion(local: LocalIosProject): Promise<string | undefined> {
  if (local.framework === "flutter") {
    const pubspec = await optional(join(local.path, "pubspec.yaml"));
    return /^version:\s*(\d+\.\d+(?:\.\d+)?)/m.exec(pubspec ?? "")?.[1];
  }
  const pbxproj = await optional(join(local.path, "ios/App/App.xcodeproj/project.pbxproj"));
  return pbxproj ? parseNativeTargets(pbxproj)[0]?.marketingVersion : undefined;
}
