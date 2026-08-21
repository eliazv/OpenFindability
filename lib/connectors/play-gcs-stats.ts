import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { google } from "googleapis";
import { createId } from "@/lib/id";
import type { PlayInstallStat, Project, SyncResult } from "@/lib/types";

// Install/uninstall counts are NOT available via any Android Publisher / Play Developer
// Reporting REST endpoint — Google only exposes them as monthly CSVs auto-exported to a
// Cloud Storage bucket (enable in Play Console > Setup > App integrity > ... > Statistics
// export, or the older "Download reports" settings page). Bucket name is account-specific
// (looks like `pubsite_prod_<id>`), so it's read from an env var rather than derived.
const STORAGE_SCOPE = "https://www.googleapis.com/auth/devstorage.read_only";

async function getStorageAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  if (!json && !file) return null;

  const credentials = JSON.parse(json || (await readFile(file as string, "utf8")));
  return new google.auth.GoogleAuth({ credentials, scopes: [STORAGE_SCOPE] });
}

// Play stats CSVs are historically UTF-16LE with a BOM; decode defensively either way.
function decodeCsv(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le", 2);
  }
  return buffer.toString("utf8").replace(/^﻿/, "");
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
  return { headers, rows };
}

function monthKeys(startDate: string, endDate: string): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= end) {
    keys.push(`${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

async function downloadObject(
  storage: ReturnType<typeof google.storage>,
  bucket: string,
  object: string,
): Promise<Buffer | null> {
  try {
    const response = await storage.objects.get(
      { bucket, object, alt: "media" },
      { responseType: "arraybuffer" },
    );
    const raw = Buffer.from(response.data as unknown as ArrayBuffer);
    // Play's export bucket stores these CSVs gzip-compressed on top of the object encoding.
    try {
      return gunzipSync(raw);
    } catch {
      return raw;
    }
  } catch (error) {
    const status = (error as { code?: number; response?: { status?: number } })?.code
      ?? (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw error;
  }
}

export async function syncPlayInstallStatsProject(
  project: Project,
  startDate: string,
  endDate: string,
): Promise<{ result: SyncResult; stats: PlayInstallStat[] }> {
  if (!project.playConsolePackageName) {
    return skipped(project.id, "Project has no Play Console package name.");
  }

  const bucket = process.env.GOOGLE_PLAY_STATS_BUCKET?.trim();
  if (!bucket) {
    return skipped(
      project.id,
      "GOOGLE_PLAY_STATS_BUCKET is not set. Enable Play Console statistics export and set the bucket name (looks like pubsite_prod_<id>).",
    );
  }

  const auth = await getStorageAuth();
  if (!auth) {
    return skipped(project.id, "GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE is not configured.");
  }

  const storage = google.storage({ version: "v1", auth });
  const packageName = project.playConsolePackageName;
  const createdAt = new Date().toISOString();
  const byDate = new Map<string, { installs?: number; uninstalls?: number; activeDeviceInstalls?: number; raw: Record<string, string> }>();

  for (const monthKey of monthKeys(startDate, endDate)) {
    const object = `stats/installs/installs_${packageName}_${monthKey}_overview.csv`;
    const buffer = await downloadObject(storage, bucket, object);
    if (!buffer) continue;

    const { headers, rows } = parseCsv(decodeCsv(buffer));
    const dateIdx = headers.indexOf("Date");
    const installsIdx = headers.indexOf("Daily Device Installs");
    const uninstallsIdx = headers.indexOf("Daily Device Uninstalls");
    const activeIdx = headers.indexOf("Active Device Installs");
    if (dateIdx === -1) continue;

    for (const cells of rows) {
      const date = cells[dateIdx];
      if (!date || date < startDate || date > endDate) continue;
      const raw: Record<string, string> = {};
      headers.forEach((header, idx) => {
        raw[header] = cells[idx];
      });
      byDate.set(date, {
        installs: installsIdx >= 0 ? Number(cells[installsIdx]) || 0 : undefined,
        uninstalls: uninstallsIdx >= 0 ? Number(cells[uninstallsIdx]) || 0 : undefined,
        activeDeviceInstalls: activeIdx >= 0 ? Number(cells[activeIdx]) || 0 : undefined,
        raw,
      });
    }
  }

  const stats: PlayInstallStat[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      id: createId("playinstall"),
      projectId: project.id,
      date,
      installs: values.installs,
      uninstalls: values.uninstalls,
      activeDeviceInstalls: values.activeDeviceInstalls,
      rawJson: values.raw,
      createdAt,
    }));

  return {
    result: {
      source: "play_stats",
      projectId: project.id,
      status: "success",
      message: stats.length > 0
        ? `Imported Play install/uninstall stats for ${stats.length} day(s) between ${startDate} and ${endDate}.`
        : `No Play statistics CSV found in gs://${bucket}/stats/installs/ for ${packageName} between ${startDate} and ${endDate}.`,
      inserted: { snapshots: stats.length, queries: 0, pages: 0 },
    },
    stats,
  };
}

function skipped(projectId: string, message: string) {
  return {
    result: {
      source: "play_stats" as const,
      projectId,
      status: "skipped" as const,
      message,
      inserted: { snapshots: 0, queries: 0, pages: 0 },
    },
    stats: [] as PlayInstallStat[],
  };
}
