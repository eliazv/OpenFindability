import "dotenv/config";
import { createId } from "@/lib/id";
import { nowIso } from "@/lib/dates";
import {
  createExperiment,
  createExperimentTreatment,
  getEditableAppStoreVersion,
  getExperimentTreatments,
  listExperiments,
} from "@/lib/connectors/appstoreconnect";
import { readData, updateData } from "@/lib/store";
import type { AscExperiment, AscExperimentTreatment, ConnectorRun } from "@/lib/types";

type Args = {
  slug?: string;
  createExperiment?: string;
  element?: string;
  addTreatment?: string;
  name?: string;
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
      case "create-experiment": args.createExperiment = value; break;
      case "element": args.element = value; break;
      case "add-treatment": args.addTreatment = value; break;
      case "name": args.name = value; break;
      default:
        throw new Error(`Unknown argument --${key}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2).filter((token) => token !== "--"));
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
    if (args.createExperiment !== undefined) {
      await runCreateExperiment(appId, project, args);
    } else if (args.addTreatment !== undefined) {
      await runAddTreatment(project, args);
    } else {
      await runSync(appId, project);
    }
    await recordRun(project.id, startedAt, "success");
  } catch (error) {
    await recordRun(project.id, startedAt, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function runSync(appId: string, project: { id: string; slug: string }) {
  const experiments = await listExperiments(appId);
  const experimentRows: AscExperiment[] = [];
  const treatmentRows: AscExperimentTreatment[] = [];

  for (const exp of experiments) {
    const localId = createId("ascexp");
    experimentRows.push({
      id: localId,
      projectId: project.id,
      ascExperimentId: exp.id,
      name: exp.name,
      state: exp.state,
      elementType: exp.elementType,
      rawJson: exp.rawJson,
      createdAt: nowIso(),
    });

    const treatments = await getExperimentTreatments(exp.id);
    for (const t of treatments) {
      treatmentRows.push({
        id: createId("ascexptr"),
        experimentId: localId,
        ascTreatmentId: t.id,
        name: t.name,
        state: t.state,
        rawJson: t.rawJson,
        createdAt: nowIso(),
      });
    }

    console.log(`${exp.name}  [${exp.state}]  (${exp.id})`);
    for (const t of treatments) {
      console.log(`  - ${t.name}${t.state ? ` [${t.state}]` : ""}`);
    }
  }

  await updateData((d) => {
    // Re-sync replaces this project's stored experiments/treatments wholesale — Apple's ids are
    // the source of truth and this is a small, infrequently-run on-demand pull, not a metric feed.
    const otherExperiments = d.ascExperiments.filter((e) => e.projectId !== project.id);
    const keptExperimentDbIds = new Set(otherExperiments.map((e) => e.id));
    d.ascExperiments = [...otherExperiments, ...experimentRows];
    d.ascExperimentTreatments = [
      ...d.ascExperimentTreatments.filter((t) => keptExperimentDbIds.has(t.experimentId)),
      ...treatmentRows,
    ];
  });

  console.log(`\nSynced ${experiments.length} experiment(s), ${treatmentRows.length} treatment(s).`);
}

async function runCreateExperiment(appId: string, project: { id: string; slug: string }, args: Args) {
  const name = args.createExperiment;
  if (!name) throw new Error("--create-experiment requires a name value.");

  const version = await getEditableAppStoreVersion(appId);
  if (!version) {
    throw new Error("No editable App Store version found — Product Page Optimization experiments attach to one.");
  }

  const experiment = await createExperiment(appId, version.id, name);
  await updateData((d) => {
    d.ascExperiments.push({
      id: createId("ascexp"),
      projectId: project.id,
      ascExperimentId: experiment.id,
      name: experiment.name,
      state: experiment.state,
      elementType: args.element ?? experiment.elementType,
      rawJson: experiment.rawJson,
      createdAt: nowIso(),
    });
  });

  console.log(`Created experiment "${experiment.name}" (${experiment.id}), state=${experiment.state}.`);
  console.log(
    "Next: attach icon/screenshot/app preview variants to it in App Store Connect (image upload isn't wired up here), " +
      `then run --add-treatment ${experiment.id} --name "..." to register a treatment shell via the API.`,
  );
}

async function runAddTreatment(project: { id: string; slug: string }, args: Args) {
  const ascExperimentId = args.addTreatment;
  const name = args.name;
  if (!ascExperimentId || !name) throw new Error("--add-treatment <ascExperimentId> requires --name.");

  const data = await readData();
  const localExperiment = data.ascExperiments.find(
    (e) => e.projectId === project.id && e.ascExperimentId === ascExperimentId,
  );
  if (!localExperiment) {
    throw new Error(`Experiment "${ascExperimentId}" not found locally — run "pnpm run asc:experiments -- --slug ${project.slug}" to sync first.`);
  }

  const treatment = await createExperimentTreatment(ascExperimentId, name);
  await updateData((d) => {
    d.ascExperimentTreatments.push({
      id: createId("ascexptr"),
      experimentId: localExperiment.id,
      ascTreatmentId: treatment.id,
      name: treatment.name,
      state: treatment.state,
      rawJson: treatment.rawJson,
      createdAt: nowIso(),
    });
  });

  console.log(`Created treatment "${treatment.name}" (${treatment.id}) on experiment ${ascExperimentId}.`);
  console.log("Attach its icon/screenshot/app preview assets in App Store Connect before starting the test.");
}

async function recordRun(projectId: string, startedAt: string, status: ConnectorRun["status"], errorMessage?: string) {
  await updateData((d) => {
    d.connectorRuns.push({
      id: createId("run"),
      source: "asc_experiments",
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
