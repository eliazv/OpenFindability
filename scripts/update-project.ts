import "dotenv/config";
import { updateData } from "@/lib/store";

type Args = {
  slug?: string;
  name?: string;
  category?: string;
  url?: string;
  gsc?: string;
  umami?: string;
  playConsole?: string;
  appStoreTrackId?: string;
  respectAsoAppId?: string;
  asoKeywords?: string;
  asoCountries?: string;
  revenueCatProjectId?: string;
  admobAppId?: string;
  admobAppIdIos?: string;
  adsenseSiteDomain?: string;
  notes?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    i += 1;
    switch (key) {
      case "slug": args.slug = value; break;
      case "name": args.name = value; break;
      case "category": args.category = value; break;
      case "url": args.url = value; break;
      case "gsc": args.gsc = value; break;
      case "umami": args.umami = value; break;
      case "play-console": args.playConsole = value; break;
      case "app-store-track-id": args.appStoreTrackId = value; break;
      case "respect-aso-app-id": args.respectAsoAppId = value; break;
      case "aso-keywords": args.asoKeywords = value; break;
      case "aso-countries": args.asoCountries = value; break;
      case "revenuecat-project-id": args.revenueCatProjectId = value; break;
      case "admob-app-id": args.admobAppId = value; break;
      case "admob-app-id-ios": args.admobAppIdIos = value; break;
      case "adsense-domain": args.adsenseSiteDomain = value; break;
      case "notes": args.notes = value; break;
      default:
        throw new Error(`Unknown argument --${key}`);
    }
  }
  return args;
}

function splitCsv(value?: string): string[] | undefined {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items && items.length > 0 ? items : undefined;
}

async function main() {
  const args = parseArgs(process.argv.slice(2).filter((token) => token !== "--"));

  if (!args.slug) {
    throw new Error(
      "Usage: pnpm run project:update -- --slug <slug> [--name \"...\"] [--category Category] " +
        "[--url https://example.com/] [--gsc sc-domain:example.com] [--umami <websiteId>] " +
        "[--play-console com.example.app] [--app-store-track-id 123] [--respect-aso-app-id 3] " +
        "[--aso-keywords \"one,two\"] [--aso-countries it,us] [--revenuecat-project-id proj_xxx] " +
        "[--admob-app-id ca-app-pub-xxx~yyy] [--admob-app-id-ios ca-app-pub-xxx~zzz] " +
        "[--adsense-domain example.com] [--notes \"...\"]\n\n" +
        "Only fields you pass are changed — everything else on the existing project is left untouched.",
    );
  }

  const slug = args.slug;

  const updates: Record<string, unknown> = {};
  if (args.name !== undefined) updates.name = args.name;
  if (args.category !== undefined) updates.category = args.category;
  if (args.url !== undefined) updates.websiteUrl = args.url;
  if (args.gsc !== undefined) updates.gscProperty = args.gsc;
  if (args.umami !== undefined) updates.umamiWebsiteId = args.umami;
  if (args.playConsole !== undefined) updates.playConsolePackageName = args.playConsole;
  if (args.appStoreTrackId !== undefined) updates.appStoreTrackId = Number(args.appStoreTrackId);
  if (args.respectAsoAppId !== undefined) updates.respectAsoAppId = Number(args.respectAsoAppId);
  if (args.asoKeywords !== undefined) updates.asoKeywords = splitCsv(args.asoKeywords);
  if (args.asoCountries !== undefined) updates.asoCountries = splitCsv(args.asoCountries);
  if (args.revenueCatProjectId !== undefined) updates.revenueCatProjectId = args.revenueCatProjectId;
  if (args.admobAppId !== undefined) updates.admobAppId = args.admobAppId;
  if (args.admobAppIdIos !== undefined) updates.admobAppIdIos = args.admobAppIdIos;
  if (args.adsenseSiteDomain !== undefined) updates.adsenseSiteDomain = args.adsenseSiteDomain;
  if (args.notes !== undefined) updates.notes = args.notes;

  if (Object.keys(updates).length === 0) {
    throw new Error("No fields to update — pass at least one field besides --slug.");
  }

  let found = false;
  const data = await updateData((current) => {
    const project = current.projects.find((p) => p.slug === slug);
    if (!project) {
      throw new Error(`No project with slug "${slug}" found. Use \`pnpm run project:add\` to create it first.`);
    }
    found = true;
    Object.assign(project, updates, { updatedAt: new Date().toISOString() });
    return current;
  });

  if (found) {
    console.log(`Updated project "${slug}": ${Object.keys(updates).join(", ")}`);
    console.log(`Total projects: ${data.projects.length}`);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
