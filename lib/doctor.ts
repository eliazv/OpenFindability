import { access } from "node:fs/promises";
import { getDataFilePath, readData } from "@/lib/store";

export async function getDoctorReport() {
  const data = await readData();
  const dataFile = getDataFilePath();
  const checks = [
    {
      name: "Data file",
      status: await exists(dataFile),
      detail: dataFile,
    },
    {
      name: "Projects",
      status: data.projects.length > 0,
      detail: `${data.projects.length} configured`,
    },
    {
      name: "GSC credentials",
      status: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_FILE),
      detail: "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE",
    },
    {
      name: "Umami credentials",
      status: Boolean(process.env.UMAMI_API_KEY),
      detail: "UMAMI_API_KEY",
    },
    {
      name: "Connector runs",
      status: data.connectorRuns.length > 0,
      detail: `${data.connectorRuns.length} recorded`,
    },
  ];

  return {
    ok: checks.every((check) => check.status),
    checks,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
