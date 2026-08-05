import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createId } from "@/lib/id";
import { nowIso } from "@/lib/dates";
import {
  getAppInfoLocalizations,
  getAppStoreVersionLocalizations,
  getEditableAppStoreVersion,
  updateAppInfoLocalization,
  updateAppStoreVersionLocalization,
} from "@/lib/connectors/appstoreconnect";
import { readData, updateData } from "@/lib/store";
import type { AscMetadataSnapshot, ConnectorRun } from "@/lib/types";

type Args = {
  slug?: string;
  locale?: string;
  name?: string;
  subtitle?: string;
  keywords?: string;
  description?: string;
  descriptionFile?: string;
  promotionalText?: string;
  whatsNew?: string;
  apply: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    switch (key) {
      case "slug": args.slug = value; i += 1; break;
      case "locale": args.locale = value; i += 1; break;
      case "name": args.name = value; i += 1; break;
      case "subtitle": args.subtitle = value; i += 1; break;
      case "keywords": args.keywords = value; i += 1; break;
      case "description": args.description = value; i += 1; break;
      case "description-file": args.descriptionFile = value; i += 1; break;
      case "promotional-text": args.promotionalText = value; i += 1; break;
      case "whats-new": args.whatsNew = value; i += 1; break;
      case "apply": args.apply = true; break;
      default:
        throw new Error(`Unknown argument --${key}`);
    }
  }
  return args;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2).filter((token) => token !== "--");
  if (command !== "pull" && command !== "push") {
    throw new Error("Usage: tsx scripts/asc-metadata.ts <pull|push> --slug <slug> [...]");
  }
  const args = parseArgs(rest);
  if (!args.slug) throw new Error("--slug is required.");

  const data = await readData();
  const project = data.projects.find((p) => p.slug === args.slug);
  if (!project) {
    throw new Error(`No project found with slug "${args.slug}". Configured slugs: ${data.projects.map((p) => p.slug).join(", ")}`);
  }
  if (!project.appStoreTrackId) {
    throw new Error(`Project "${project.slug}" has no appStoreTrackId configured. Run "pnpm run asc:apps" to find it.`);
  }
  const appId = String(project.appStoreTrackId);
  const startedAt = nowIso();

  try {
    if (command === "pull") {
      await runPull(appId, project, args);
    } else {
      await runPush(appId, project, args);
    }
    await recordRun(project.id, startedAt, "success");
  } catch (error) {
    await recordRun(project.id, startedAt, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function runPull(appId: string, project: { id: string; slug: string }, args: Args) {
  const appInfoLocalizations = await getAppInfoLocalizations(appId);
  const version = await getEditableAppStoreVersion(appId);
  const versionLocalizations = version ? await getAppStoreVersionLocalizations(version.id) : [];

  const locales = new Set([...appInfoLocalizations.map((l) => l.locale), ...versionLocalizations.map((l) => l.locale)]);
  const targetLocales = args.locale ? [args.locale] : [...locales];

  const rows: AscMetadataSnapshot[] = [];
  const lines: string[] = [`# App Store Connect — testi correnti (${project.slug})`, "", `Pulled: ${nowIso()}`, ""];
  if (!version) {
    lines.push("_No editable App Store version found (no draft in progress) — description/keywords/promotional text/whatsNew unavailable, only name/subtitle shown._", "");
  }

  for (const locale of targetLocales) {
    const info = appInfoLocalizations.find((l) => l.locale === locale);
    const ver = versionLocalizations.find((l) => l.locale === locale);
    if (!info && !ver) continue;

    lines.push(`## ${locale}`, "");
    if (info) lines.push(`- **Name**: ${info.name ?? ""}`, `- **Subtitle**: ${info.subtitle ?? ""}`);
    if (ver) {
      lines.push(
        `- **Keywords**: ${ver.keywords ?? ""}`,
        `- **Promotional text**: ${ver.promotionalText ?? ""}`,
        `- **Description**: ${ver.description ?? ""}`,
        `- **What's new**: ${ver.whatsNew ?? ""}`,
      );
    }
    lines.push("");

    rows.push({
      id: createId("ascmeta"),
      projectId: project.id,
      locale,
      kind: "pull",
      name: info?.name,
      subtitle: info?.subtitle,
      keywords: ver?.keywords,
      description: ver?.description,
      promotionalText: ver?.promotionalText,
      whatsNew: ver?.whatsNew,
      versionState: version?.state,
      rawJson: { appInfo: info, version: ver },
      createdAt: nowIso(),
    });
  }

  if (rows.length === 0) {
    console.log(`No App Store Connect localizations found for locale(s): ${targetLocales.join(", ")}`);
    return;
  }

  await updateData((d) => {
    d.ascMetadataSnapshots.push(...rows);
  });

  const reportsDir = path.join(process.cwd(), "project", project.slug, "reports");
  await mkdir(reportsDir, { recursive: true });
  const fileName = `${nowIso().slice(0, 10)}-appstoreconnect-copy.md`;
  await writeFile(path.join(reportsDir, fileName), lines.join("\n"), "utf8");
  console.log(lines.join("\n"));
  console.log(`\nWrote project/${project.slug}/reports/${fileName} and stored ${rows.length} ascMetadataSnapshots row(s).`);
}

async function runPush(appId: string, project: { id: string; slug: string }, args: Args) {
  if (!args.locale) throw new Error("--locale is required for push (e.g. --locale it).");

  const description = args.descriptionFile ? await readFile(args.descriptionFile, "utf8") : args.description;
  const appInfoFields = { name: args.name, subtitle: args.subtitle };
  const versionFields = {
    keywords: args.keywords,
    description,
    promotionalText: args.promotionalText,
    whatsNew: args.whatsNew,
  };
  const hasAppInfoChange = Object.values(appInfoFields).some((v) => v !== undefined);
  const hasVersionChange = Object.values(versionFields).some((v) => v !== undefined);
  if (!hasAppInfoChange && !hasVersionChange) {
    throw new Error("Nothing to push — pass at least one of --name --subtitle --keywords --description[-file] --promotional-text --whats-new.");
  }

  const appInfoLocalizations = hasAppInfoChange ? await getAppInfoLocalizations(appId) : [];
  const appInfoLoc = appInfoLocalizations.find((l) => l.locale === args.locale);
  if (hasAppInfoChange && !appInfoLoc) {
    throw new Error(`No app info localization for locale "${args.locale}". Run "pull" first to see available locales.`);
  }

  let version: Awaited<ReturnType<typeof getEditableAppStoreVersion>> = null;
  let versionLoc: Awaited<ReturnType<typeof getAppStoreVersionLocalizations>>[number] | undefined;
  if (hasVersionChange) {
    version = await getEditableAppStoreVersion(appId);
    if (!version) {
      throw new Error(
        "No editable App Store version (no draft in PREPARE_FOR_SUBMISSION/rejected state). " +
          "Create a new version in App Store Connect before pushing description/keywords/promotional text/whatsNew.",
      );
    }
    const versionLocalizations = await getAppStoreVersionLocalizations(version.id);
    versionLoc = versionLocalizations.find((l) => l.locale === args.locale);
    if (!versionLoc) {
      throw new Error(`No version localization for locale "${args.locale}" on the editable version.`);
    }
  }

  console.log(`Dry run for "${project.slug}" / ${args.locale}${args.apply ? " (APPLYING)" : " (pass --apply to write)"}:\n`);
  if (hasAppInfoChange && appInfoLoc) {
    if (args.name !== undefined) console.log(`  name:      "${appInfoLoc.name ?? ""}" -> "${args.name}"`);
    if (args.subtitle !== undefined) console.log(`  subtitle:  "${appInfoLoc.subtitle ?? ""}" -> "${args.subtitle}"`);
  }
  if (hasVersionChange && versionLoc) {
    if (args.keywords !== undefined) console.log(`  keywords:  "${versionLoc.keywords ?? ""}" -> "${args.keywords}"`);
    if (args.promotionalText !== undefined) console.log(`  promo:     "${versionLoc.promotionalText ?? ""}" -> "${args.promotionalText}"`);
    if (description !== undefined) console.log(`  description: (${(versionLoc.description ?? "").length} chars) -> (${description.length} chars)`);
    if (args.whatsNew !== undefined) console.log(`  whatsNew:  "${versionLoc.whatsNew ?? ""}" -> "${args.whatsNew}"`);
  }

  if (!args.apply) {
    console.log("\nDry run only — nothing was written. Re-run with --apply to push these changes.");
    return;
  }

  if (hasAppInfoChange && appInfoLoc) {
    await updateAppInfoLocalization(appInfoLoc.id, {
      name: args.name ?? appInfoLoc.name,
      subtitle: args.subtitle ?? appInfoLoc.subtitle,
    });
  }
  if (hasVersionChange && versionLoc) {
    await updateAppStoreVersionLocalization(versionLoc.id, {
      keywords: args.keywords ?? versionLoc.keywords,
      description: description ?? versionLoc.description,
      promotionalText: args.promotionalText ?? versionLoc.promotionalText,
      whatsNew: args.whatsNew ?? versionLoc.whatsNew,
    });
  }

  const row: AscMetadataSnapshot = {
    id: createId("ascmeta"),
    projectId: project.id,
    locale: args.locale,
    kind: "push",
    name: args.name ?? appInfoLoc?.name,
    subtitle: args.subtitle ?? appInfoLoc?.subtitle,
    keywords: args.keywords ?? versionLoc?.keywords,
    description: description ?? versionLoc?.description,
    promotionalText: args.promotionalText ?? versionLoc?.promotionalText,
    whatsNew: args.whatsNew ?? versionLoc?.whatsNew,
    versionState: version?.state,
    rawJson: { pushedFields: { ...appInfoFields, ...versionFields } },
    createdAt: nowIso(),
  };
  await updateData((d) => {
    d.ascMetadataSnapshots.push(row);
  });

  console.log("\nApplied. Changes land on the App Store after Apple review of the current draft version.");
}

async function recordRun(projectId: string, startedAt: string, status: ConnectorRun["status"], errorMessage?: string) {
  await updateData((d) => {
    d.connectorRuns.push({
      id: createId("run"),
      source: "asc_metadata",
      projectId,
      status,
      startedAt,
      finishedAt: nowIso(),
      errorMessage,
    });
  });
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
