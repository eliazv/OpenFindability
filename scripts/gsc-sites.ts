import "dotenv/config";
import { listGscSites } from "@/lib/connectors/gsc";
import { readData } from "@/lib/store";

async function main() {
  const [sites, data] = await Promise.all([listGscSites(), readData()]);

  console.log(`GSC properties accessible to the service account: ${sites.length}`);
  for (const site of sites) {
    const project = data.projects.find((p) => p.gscProperty === site.siteUrl);
    const status = project ? `linked -> project "${project.slug}"` : "NOT LINKED to any project";
    console.log(`  ${site.siteUrl}  (${site.permissionLevel ?? "unknown permission"})  ${status}`);
  }

  const unlinkedProjects = data.projects.filter(
    (project) => project.gscProperty && !sites.some((site) => site.siteUrl === project.gscProperty),
  );
  if (unlinkedProjects.length > 0) {
    console.log();
    console.log("Projects with a configured gscProperty the service account cannot access:");
    for (const project of unlinkedProjects) {
      console.log(`  ${project.slug}: ${project.gscProperty}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
