import "dotenv/config";
import { readFile } from "node:fs/promises";
import { writeAsoSeoResearchReport } from "@/lib/aso-research";

type Args = {
  slug?: string;
  outputSlug?: string;
  title?: string;
  gscSlug?: string;
  keywords?: string;
  keywordsFile?: string;
  country?: string[];
  respectAsoAppId?: string;
  urlContains?: string[];
  queryContains?: string[];
  cacheMaxAgeDays?: string;
  forceRefresh?: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    index += 1;

    switch (key) {
      case "slug":
        args.slug = value;
        break;
      case "output-slug":
        args.outputSlug = value;
        break;
      case "title":
        args.title = value;
        break;
      case "gsc-slug":
        args.gscSlug = value;
        break;
      case "keywords":
        args.keywords = value;
        break;
      case "keywords-file":
        args.keywordsFile = value;
        break;
      case "country":
        args.country = [...(args.country ?? []), value];
        break;
      case "respect-aso-app-id":
        args.respectAsoAppId = value;
        break;
      case "url-contains":
        args.urlContains = [...(args.urlContains ?? []), value];
        break;
      case "query-contains":
        args.queryContains = [...(args.queryContains ?? []), value];
        break;
      case "cache-max-age-days":
        args.cacheMaxAgeDays = value;
        break;
      case "refresh":
        args.forceRefresh = true;
        index -= 1;
        break;
      default:
        throw new Error(`Unknown argument --${key}`);
    }
  }
  return args;
}

function splitList(value?: string): string[] {
  return (value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readKeywords(args: Args): Promise<string[]> {
  const inline = splitList(args.keywords);
  if (!args.keywordsFile) return inline;

  const raw = await readFile(args.keywordsFile, "utf8");
  return [...inline, ...splitList(raw)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2).filter((token) => token !== "--"));
  if (!args.slug) {
    throw new Error(
      "Usage: pnpm run research:aso -- --slug <project-slug> [--gsc-slug <project-slug>] " +
        "[--output-slug <project-report-folder>] [--title \"Report title\"] " +
        "[--keywords \"one,two\"] [--keywords-file path] [--country it] " +
        "[--respect-aso-app-id 3] [--url-contains host] [--query-contains term] " +
        "[--cache-max-age-days 14] [--refresh]",
    );
  }

  const filePath = await writeAsoSeoResearchReport({
    slug: args.slug,
    outputSlug: args.outputSlug,
    title: args.title,
    gscSlug: args.gscSlug,
    keywords: await readKeywords(args),
    countries: args.country ?? ["it"],
    respectAsoAppId: args.respectAsoAppId ? Number(args.respectAsoAppId) : undefined,
    urlContains: args.urlContains ?? [],
    queryContains: args.queryContains ?? [],
    cacheMaxAgeDays: args.cacheMaxAgeDays ? Number(args.cacheMaxAgeDays) : undefined,
    forceRefresh: args.forceRefresh,
  });

  console.log(`Wrote ASO + SEO research report to ${filePath}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
