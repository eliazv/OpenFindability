import "dotenv/config";
import { readFile } from "node:fs/promises";
import { getPlayStoreListing, updatePlayStoreListing } from "@/lib/connectors/play-console";
import { readData } from "@/lib/store";

type Args = {
  slug?: string;
  language?: string;
  title?: string;
  shortDescription?: string;
  fullDescription?: string;
  fullDescriptionFile?: string;
  apply: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, language: "it" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    switch (key) {
      case "slug": args.slug = value; i += 1; break;
      case "language": args.language = value; i += 1; break;
      case "title": args.title = value; i += 1; break;
      case "short-description": args.shortDescription = value; i += 1; break;
      case "full-description": args.fullDescription = value; i += 1; break;
      case "full-description-file": args.fullDescriptionFile = value; i += 1; break;
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
    throw new Error("Usage: tsx scripts/play-push-copy.ts <pull|push> --slug <slug> [...]");
  }
  const args = parseArgs(rest);
  if (!args.slug) throw new Error("--slug is required.");

  const data = await readData();
  const project = data.projects.find((p) => p.slug === args.slug);
  if (!project) {
    throw new Error(`No project found with slug "${args.slug}". Configured slugs: ${data.projects.map((p) => p.slug).join(", ")}`);
  }
  if (!project.playConsolePackageName) {
    throw new Error(`Project "${project.slug}" has no playConsolePackageName configured.`);
  }
  const packageName = project.playConsolePackageName;
  const language = args.language ?? "it";

  if (command === "pull") {
    const listing = await getPlayStoreListing(packageName, language);
    if (!listing) {
      console.log(`No live listing found for language "${language}".`);
      return;
    }
    console.log(`Live Play Store listing for "${packageName}" / ${language}:\n`);
    console.log(`Title (${(listing.title ?? "").length}/30):\n${listing.title}\n`);
    console.log(`Short description (${(listing.shortDescription ?? "").length}/80):\n${listing.shortDescription}\n`);
    console.log(`Full description (${(listing.fullDescription ?? "").length}/4000):\n${listing.fullDescription}\n`);
    return;
  }

  const fullDescription = args.fullDescriptionFile
    ? await readFile(args.fullDescriptionFile, "utf8")
    : args.fullDescription;

  if (!args.title && !args.shortDescription && !fullDescription) {
    throw new Error("Nothing to push — pass at least one of --title --short-description --full-description[-file].");
  }

  const current = await getPlayStoreListing(packageName, language);

  console.log(`Dry run for "${project.slug}" / ${language}${args.apply ? " (APPLYING)" : " (pass --apply to write)"}:\n`);
  if (args.title !== undefined) console.log(`  title: "${current?.title ?? ""}" -> "${args.title}"`);
  if (args.shortDescription !== undefined) console.log(`  shortDescription: "${current?.shortDescription ?? ""}" -> "${args.shortDescription}"`);
  if (fullDescription !== undefined) console.log(`  fullDescription: (${(current?.fullDescription ?? "").length} chars) -> (${fullDescription.length} chars)`);

  if (!args.apply) {
    console.log("\nDry run only — nothing was written. Re-run with --apply to push these changes.");
    return;
  }

  await updatePlayStoreListing(packageName, {
    language,
    title: args.title ?? current?.title ?? undefined,
    shortDescription: args.shortDescription ?? current?.shortDescription ?? undefined,
    fullDescription: fullDescription ?? current?.fullDescription ?? undefined,
  });

  console.log("\nApplied. Play Store listings go live within a few hours, no review needed.");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
