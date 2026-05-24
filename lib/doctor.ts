import { access } from "node:fs/promises";
import { getDataFilePath, readData } from "@/lib/store";

export async function getDoctorReport() {
  const data = await readData();
  const dataFile = getDataFilePath();
  const checks = [
    {
      name: "Data file",
      status: await exists(dataFile),
      required: true,
      detail: dataFile,
    },
    {
      name: "Projects",
      status: data.projects.length > 0,
      required: true,
      detail: `${data.projects.length} configured`,
    },
    {
      name: "GSC credentials",
      status: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_FILE),
      required: false,
      detail: "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE",
    },
    {
      name: "Umami credentials",
      status: Boolean(process.env.UMAMI_API_KEY),
      required: false,
      detail: "UMAMI_API_KEY",
    },
    {
      name: "Connector runs",
      status: data.connectorRuns.length > 0,
      required: false,
      detail: `${data.connectorRuns.length} recorded`,
    },
  ];

  return {
    ok: checks.every((check) => check.status || !check.required),
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
