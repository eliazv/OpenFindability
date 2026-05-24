import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppData } from "@/lib/types";

const emptyData: AppData = {
  projects: [],
  metricSnapshots: [],
  searchQueries: [],
  pageMetrics: [],
  opportunities: [],
  connectorRuns: [],
};

export function getDataFilePath(): string {
  return path.join(process.cwd(), "data", "openfindability.json");
}

export async function readData(): Promise<AppData> {
  const filePath = getDataFilePath();

  try {
    const raw = await readFile(filePath, "utf8");
    return { ...emptyData, ...JSON.parse(raw) } as AppData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(emptyData);
    }
    throw error;
  }
}

export async function writeData(data: AppData): Promise<void> {
  const filePath = getDataFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function updateData(mutator: (data: AppData) => AppData | void): Promise<AppData> {
  const data = await readData();
  const next = mutator(data) ?? data;
  await writeData(next);
  return next;
}
