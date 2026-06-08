import "dotenv/config";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createId } from "@/lib/id";
import { updateData } from "@/lib/store";
import type { Project, ProjectType } from "@/lib/types";

type Args = {
  name?: string;
  slug?: string;
  type?: string;
  category?: string;
  url?: string;
  gsc?: string;
  umami?: string;
  playConsole?: string;
  notes?: string;
};

const PROJECT_TYPES: ProjectType[] = ["web", "app", "web_app"];

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    i += 1;
    switch (key) {
      case "name": args.name = value; break;
      case "slug": args.slug = value; break;
      case "type": args.type = value; break;
      case "category": args.category = value; break;
      case "url": args.url = value; break;
      case "gsc": args.gsc = value; break;
      case "umami": args.umami = value; break;
      case "play-console": args.playConsole = value; break;
      case "notes": args.notes = value; break;
      default:
        throw new Error(`Unknown argument --${key}`);
    }
  }
  return args;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const args = parseArgs(process.argv.slice(2).filter((token) => token !== "--"));

  if (!args.name) {
    throw new Error(
      "Usage: pnpm run project:add -- --name \"Project Name\" [--slug slug] [--type web|app|web_app] " +
        "[--category Category] [--url https://example.com/] [--gsc sc-domain:example.com] " +
        "[--umami <websiteId>] [--play-console com.example.app] [--notes \"...\"]",
    );
  }

  const slug = args.slug ? slugify(args.slug) : slugify(args.name);
  if (!slug) {
    throw new Error("Could not derive a slug from the project name. Pass --slug explicitly.");
  }

  const type: ProjectType = PROJECT_TYPES.includes(args.type as ProjectType) ? (args.type as ProjectType) : "web";
  const now = new Date().toISOString();

  const project: Project = {
    id: createId("project"),
    name: args.name,
    slug,
    type,
    category: args.category,
    websiteUrl: args.url,
    gscProperty: args.gsc,
    umamiWebsiteId: args.umami,
    playConsolePackageName: args.playConsole,
    notes: args.notes,
    createdAt: now,
    updatedAt: now,
  };

  const data = await updateData((current) => {
    if (current.projects.some((p) => p.slug === slug)) {
      throw new Error(`A project with slug "${slug}" already exists.`);
    }
    current.projects.push(project);
    return current;
  });

  const projectDir = path.join(process.cwd(), "project", slug);
  for (const sub of ["reports", "context", "notes"]) {
    await mkdir(path.join(projectDir, sub), { recursive: true });
  }

  console.log(`Added project "${project.name}" (slug: ${slug}, id: ${project.id}).`);
  console.log(`Created folders: project/${slug}/{reports,context,notes}`);
  console.log(`Total projects: ${data.projects.length}`);

  if (!project.gscProperty && !project.umamiWebsiteId && !project.playConsolePackageName) {
    console.log("Note: no data source configured yet (gsc/umami/play-console). Add one before running `pnpm run sync`.");
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
