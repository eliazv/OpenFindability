import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  getPlayTracks,
  uploadPlayBundle,
  type PlayReleaseStatus,
  type PlayTrack,
} from "@/lib/connectors/play-console";

// Android release pipeline for Flutter apps: preflight -> `flutter build appbundle` -> signature
// check -> Android Publisher upload. Deliberately free of any db/store import so both the CLI
// (`scripts/release.ts`) and `mcp/server.ts` (own db instance, arbitrary cwd) can call it.

export type ReleaseMode = "check" | "build" | "apply";

export type AndroidReleaseOptions = {
  projectPath: string;
  packageName: string;
  track: string;
  mode: ReleaseMode;
  status?: PlayReleaseStatus;
  userFraction?: number;
  releaseNotes?: string;
  releaseNotesLanguage?: string;
  buildName?: string;
  buildNumber?: number | "auto";
  flavor?: string;
  // Pre-built bundle: skips `flutter build` entirely.
  aabPath?: string;
  // Central `key.properties` (secrets/android/<slug>/key.properties). When the file exists its
  // keystore is injected into Gradle, overriding whatever signing the Flutter project declares.
  signingPropertiesFile?: string;
  log?: (line: string) => void;
  // Raw `flutter build` output chunks. The MCP server must not forward these to stdout.
  onBuildOutput?: (chunk: string) => void;
};

export type AndroidReleaseResult = {
  mode: ReleaseMode;
  packageName: string;
  track: string;
  status: PlayReleaseStatus;
  versionName: string;
  versionCode: number;
  highestPlayVersionCode: number;
  signing: "central" | "project";
  warnings: string[];
  aabPath?: string;
  aabSizeBytes?: number;
  signer?: string;
  uploaded: boolean;
  rawJson?: unknown;
};

export type FlutterProjectInfo = {
  versionName?: string;
  buildNumber?: number;
  applicationId?: string;
  releaseUsesDebugSigning: boolean;
};

const SAFE_ARG = /^[\w.+-]+$/;
const MAX_RELEASE_NOTES = 500;

export async function readFlutterProject(projectPath: string): Promise<FlutterProjectInfo> {
  const pubspecPath = join(projectPath, "pubspec.yaml");
  if (!existsSync(pubspecPath)) {
    throw new Error(`No pubspec.yaml in "${projectPath}" — not a Flutter project root.`);
  }
  const pubspec = await readFile(pubspecPath, "utf8");
  const version = pubspec.match(/^version:\s*["']?([^\s"'#]+)/m)?.[1];
  const [versionName, build] = version?.split("+") ?? [];

  const gradlePath = ["build.gradle.kts", "build.gradle"]
    .map((name) => join(projectPath, "android", "app", name))
    .find((path) => existsSync(path));
  const gradle = gradlePath ? await readFile(gradlePath, "utf8") : "";

  return {
    versionName,
    buildNumber: build && /^\d+$/.test(build) ? Number(build) : undefined,
    applicationId: gradle.match(/applicationId\s*=?\s*["']([^"']+)["']/)?.[1],
    // Flutter's default template signs release builds with the debug key until you change it.
    releaseUsesDebugSigning: /signingConfig\s*=?\s*signingConfigs\.(getByName\(\s*"debug"\s*\)|debug\b)/.test(gradle),
  };
}

export function highestVersionCode(tracks: PlayTrack[]): number {
  return Math.max(0, ...tracks.flatMap((track) => track.releases.flatMap((release) => release.versionCodes)));
}

export async function releaseAndroid(options: AndroidReleaseOptions): Promise<AndroidReleaseResult> {
  const log = options.log ?? (() => {});
  const projectPath = resolve(options.projectPath);
  const warnings: string[] = [];

  for (const [name, value] of [["--build-name", options.buildName], ["--flavor", options.flavor]] as const) {
    if (value !== undefined && !SAFE_ARG.test(value)) throw new Error(`Invalid ${name} value "${value}".`);
  }
  if (options.userFraction !== undefined && !(options.userFraction > 0 && options.userFraction < 1)) {
    throw new Error("Rollout fraction must be between 0 and 1 (exclusive), e.g. 0.2 for 20%.");
  }
  if (options.releaseNotes && options.releaseNotes.length > MAX_RELEASE_NOTES) {
    throw new Error(`Release notes are ${options.releaseNotes.length} chars; Play allows ${MAX_RELEASE_NOTES}.`);
  }
  const status: PlayReleaseStatus = options.status ?? (options.userFraction ? "inProgress" : "completed");
  if (status === "inProgress" && options.userFraction === undefined) {
    throw new Error('Status "inProgress" is a staged rollout — pass a rollout fraction.');
  }

  const info = await readFlutterProject(projectPath);
  if (info.applicationId && info.applicationId !== options.packageName) {
    const message = `android/app/build.gradle applicationId is "${info.applicationId}" but the project's Play package is "${options.packageName}".`;
    // A flavor can legitimately override applicationId, so only the flavorless case is certain.
    if (options.flavor) warnings.push(message);
    else throw new Error(`${message} Wrong --path, or fix playConsolePackageName.`);
  }

  const central = await loadCentralSigning(options.signingPropertiesFile);
  const signing = central ? "central" : "project";
  if (!central && info.releaseUsesDebugSigning && !options.aabPath) {
    warnings.push(
      "The Flutter project's release build type uses the debug signing config. Play rejects debug-signed bundles — " +
        "add a central key.properties under secrets/android/<slug>/ or configure release signing in the project.",
    );
  }

  const tracks = await getPlayTracks(options.packageName);
  const highestPlayVersionCode = highestVersionCode(tracks);

  let versionCode: number | undefined;
  let buildNumberArg: number | undefined;
  if (options.buildNumber === "auto") {
    versionCode = buildNumberArg = highestPlayVersionCode + 1;
  } else if (options.buildNumber !== undefined) {
    versionCode = buildNumberArg = options.buildNumber;
  } else {
    versionCode = info.buildNumber;
  }
  const versionName = options.buildName ?? info.versionName ?? "";

  // A pre-built bundle carries its own versionCode, which only Play can tell us at upload time.
  if (!options.aabPath) {
    if (versionCode === undefined) {
      throw new Error("pubspec.yaml has no build number (version: x.y.z+N). Pass --build-number <n|auto>.");
    }
    if (versionCode <= highestPlayVersionCode) {
      throw new Error(
        `Version code ${versionCode} is not higher than ${highestPlayVersionCode}, the highest already on Play. ` +
          "Bump pubspec.yaml or pass --build-number auto.",
      );
    }
  }

  const result: AndroidReleaseResult = {
    mode: options.mode,
    packageName: options.packageName,
    track: options.track,
    status,
    versionName,
    versionCode: versionCode ?? 0,
    highestPlayVersionCode,
    signing,
    warnings,
    uploaded: false,
  };

  if (options.mode === "check") return result;

  let aabPath: string;
  if (options.aabPath) {
    aabPath = resolve(options.aabPath);
    if (!existsSync(aabPath)) throw new Error(`Bundle not found: ${aabPath}`);
  } else {
    const args = ["build", "appbundle", "--release"];
    if (options.buildName) args.push("--build-name", options.buildName);
    if (buildNumberArg !== undefined) args.push("--build-number", String(buildNumberArg));
    if (options.flavor) args.push("--flavor", options.flavor);

    log(`Running: flutter ${args.join(" ")}  (in ${projectPath})`);
    await runFlutter(args, projectPath, central?.env ?? {}, options.onBuildOutput);

    const flavor = options.flavor;
    aabPath = flavor
      ? join(projectPath, "build", "app", "outputs", "bundle", `${flavor}Release`, `app-${flavor}-release.aab`)
      : join(projectPath, "build", "app", "outputs", "bundle", "release", "app-release.aab");
    if (!existsSync(aabPath)) throw new Error(`Build finished but no bundle at ${aabPath}`);
  }

  result.aabPath = aabPath;
  result.aabSizeBytes = (await stat(aabPath)).size;

  const signer = await readBundleSigner(aabPath);
  if (signer === undefined) {
    warnings.push("keytool not found (PATH or JAVA_HOME) — could not verify the bundle signature before upload.");
  } else if (signer === null) {
    throw new Error(`${aabPath} is not signed. Play only accepts signed bundles.`);
  } else if (/CN=Android Debug/i.test(signer.owner)) {
    throw new Error(
      `${aabPath} is signed with the Android debug key (${signer.owner}). Not uploading — ` +
        "configure release signing (central secrets/android/<slug>/key.properties or the project's own).",
    );
  } else {
    // Never trust that the injection took effect: compare against the central keystore's own cert.
    if (central) {
      const expected = await readKeystoreFingerprint(central);
      if (!expected || expected !== signer.sha256) {
        throw new Error(
          `${aabPath} is signed by "${signer.owner}" (SHA256 ${signer.sha256 ?? "?"}), not by the central keystore ` +
            `${central.storePath} alias "${central.keyAlias}" (SHA256 ${expected ?? "unreadable"}). Not uploading.`,
        );
      }
    }
    result.signer = signer.owner;
  }

  if (options.mode === "build") return result;

  log(`Uploading ${aabPath} to Play track "${options.track}" (${status})...`);
  const upload = await uploadPlayBundle(options.packageName, aabPath, {
    track: options.track,
    status,
    userFraction: options.userFraction,
    releaseNotes: options.releaseNotes
      ? [{ language: options.releaseNotesLanguage ?? "it-IT", text: options.releaseNotes }]
      : undefined,
  });

  result.versionCode = upload.versionCode;
  result.uploaded = true;
  result.rawJson = upload.rawJson;
  return result;
}

// Same file format Flutter documents for android/key.properties; storeFile is resolved relative
// to the properties file so each app's keystore can sit next to it.
type CentralSigning = {
  storePath: string;
  storePassword: string;
  keyAlias: string;
  env: Record<string, string>;
};

async function loadCentralSigning(propertiesFile?: string): Promise<CentralSigning | null> {
  if (!propertiesFile || !existsSync(propertiesFile)) return null;

  const props = new Map<string, string>();
  for (const line of (await readFile(propertiesFile, "utf8")).split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
    if (match) props.set(match[1], match[2]);
  }

  const missing = ["storeFile", "storePassword", "keyAlias", "keyPassword"].filter((key) => !props.get(key));
  if (missing.length > 0) throw new Error(`${propertiesFile} is missing: ${missing.join(", ")}`);

  const storeFile = props.get("storeFile") as string;
  const storePath = isAbsolute(storeFile) ? storeFile : join(dirname(propertiesFile), storeFile);
  if (!existsSync(storePath)) throw new Error(`Keystore not found: ${storePath} (from ${propertiesFile})`);

  const values = {
    "store.file": storePath,
    "store.password": props.get("storePassword") as string,
    "key.alias": props.get("keyAlias") as string,
    "key.password": props.get("keyPassword") as string,
  };
  for (const [key, value] of Object.entries(values)) {
    if (/["%]/.test(value)) throw new Error(`${propertiesFile}: ${key} contains " or %, which cannot be passed to Gradle safely.`);
  }

  // The Android Gradle Plugin's `android.injected.signing.*` project properties override the
  // signingConfig of every variant, so no per-project Gradle change is needed. `flutter build`
  // has no flag to forward -P options, and the ORG_GRADLE_PROJECT_* env route does not survive it
  // on Windows (Dart upper-cases env var names, Gradle property names are case-sensitive) — so
  // they travel as -Dorg.gradle.project.* system properties in GRADLE_OPTS instead.
  const injected = Object.entries(values)
    .map(([key, value]) => `"-Dorg.gradle.project.android.injected.signing.${key}=${value}"`)
    .join(" ");

  return {
    storePath,
    storePassword: values["store.password"],
    keyAlias: values["key.alias"],
    env: { GRADLE_OPTS: [process.env.GRADLE_OPTS, injected].filter(Boolean).join(" ") },
  };
}

function runFlutter(
  args: string[],
  cwd: string,
  extraEnv: Record<string, string>,
  onOutput?: (chunk: string) => void,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    // shell: true because on Windows `flutter` is flutter.bat; args are validated against SAFE_ARG.
    const child = spawn("flutter", args, { cwd, env: { ...process.env, ...extraEnv }, shell: true });
    let tail = "";
    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-4000);
      onOutput?.(text);
    };
    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);
    child.on("error", (error) => reject(new Error(`Could not start flutter: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`flutter ${args.join(" ")} exited with code ${code}.\n${onOutput ? "" : tail}`.trim()));
    });
  });
}

function keytoolPath(): string {
  const javaHome = process.env.JAVA_HOME;
  const bundled = javaHome ? join(javaHome, "bin", process.platform === "win32" ? "keytool.exe" : "keytool") : "";
  return bundled && existsSync(bundled) ? bundled : "keytool";
}

// Resolves to keytool's combined output, or undefined when keytool cannot be started.
function runKeytool(args: string[]): Promise<string | undefined> {
  return new Promise((resolvePromise) => {
    const child = spawn(keytoolPath(), args);
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", () => resolvePromise(undefined));
    child.on("close", () => resolvePromise(output));
  });
}

const SHA256 = /SHA-?256:\s*([0-9A-F:]{95})/i;

// null when the bundle is unsigned, undefined when keytool is unavailable.
async function readBundleSigner(aabPath: string): Promise<{ owner: string; sha256?: string } | null | undefined> {
  const output = await runKeytool(["-printcert", "-jarfile", aabPath]);
  if (output === undefined) return undefined;
  // keytool localizes its labels (e.g. "Proprietario:" in Italian), so match the DN itself.
  const owner = output.match(/CN=[^\r\n]*/)?.[0];
  return owner ? { owner: owner.trim(), sha256: output.match(SHA256)?.[1].toUpperCase() } : null;
}

async function readKeystoreFingerprint(central: CentralSigning): Promise<string | undefined> {
  const output = await runKeytool([
    "-list", "-v", "-keystore", central.storePath, "-alias", central.keyAlias, "-storepass", central.storePassword,
  ]);
  return output?.match(SHA256)?.[1].toUpperCase();
}
