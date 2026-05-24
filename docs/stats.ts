/**
 * VitaRomagna — Dashboard statistiche
 * Aggrega: Search Console + Umami + Supabase DB
 *
 * Uso:
 *   npx tsx scripts/stats.ts                # ultimi 30 giorni
 *   npx tsx scripts/stats.ts --days 7       # ultimi 7 giorni
 *   npx tsx scripts/stats.ts --env local    # usa .env.local
 *   npx tsx scripts/stats.ts --report       # scrive MD in doc/11-report-statistiche/
 */

import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import postgres from "postgres";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DAYS = (() => {
  const i = process.argv.indexOf("--days");
  return i !== -1 ? parseInt(process.argv[i + 1], 10) : 30;
})();
const USE_LOCAL = process.argv.includes("--env") && process.argv[process.argv.indexOf("--env") + 1] === "local";
const WRITE_REPORT = process.argv.includes("--report");

const ENV_FILE = path.join(process.cwd(), USE_LOCAL ? ".env.local" : ".env.production");
const SC_KEY_FILE = path.join(process.cwd(), "sensibili/google cloud/vitaromagna-68d1f2372cda.json");
const SC_SITE = "sc-domain:vitaromagna.it";
const UMAMI_API = "https://api.umami.is/v1";
const UMAMI_WEBSITE_ID = "bbb95d31-17a4-40cb-a9f7-121c084c0658";
const REPORT_DIR = path.join(process.cwd(), "doc/11-report-statistiche");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScTotals { clicks: number; impressions: number; ctr: number; position: number }
interface ScRow { key: string; clicks: number; position: number; ctr: number }
interface ScData {
  totals: ScTotals;
  topQueries: ScRow[];
  topPages: ScRow[];
  devices: Array<{ device: string; clicks: number; ctr: number; position: number }>;
}
interface UmamiData {
  visitors: number;
  sessions: number;
  pageviews: number;
  bounceRate: number;
  avgDurationSec: number;
  topPages: Array<{ url: string; views: number }>;
  devices: Array<{ device: string; sessions: number }>;
  countries: Array<{ country: string; sessions: number }>;
}
interface DbData {
  users: number;
  establishments: number; establishmentsClaimed: number;
  jobsTotal: number; jobsManual: number;
  accommodationsTotal: number; accommodationsManual: number;
  talentsTotal: number; talentsUser: number;
  eventsTotal: number; eventsUser: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
      })
  );
}

const env = loadEnv(ENV_FILE);

function dateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(start), end: fmt(end), startMs: start.getTime(), endMs: end.getTime() };
}

function bar(label: string, width = 60) {
  const line = "─".repeat(width);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${label.padEnd(width - 2)}│`);
  console.log(`└${line}┘`);
}

function row(label: string, value: string | number, width = 60) {
  const l = String(label).padEnd(35);
  const v = String(value).padStart(width - 37);
  console.log(`  ${l} ${v}`);
}

function num(n: number) { return n.toLocaleString("it"); }

// ---------------------------------------------------------------------------
// Search Console — fetch
// ---------------------------------------------------------------------------

async function fetchSearchConsole(range: ReturnType<typeof dateRange>): Promise<ScData | null> {
  const key = JSON.parse(fs.readFileSync(SC_KEY_FILE, "utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  const sc = google.searchconsole({ version: "v1", auth });

  const [totalsRes, queriesRes, pagesRes, devicesRes] = await Promise.all([
    sc.searchanalytics.query({
      siteUrl: SC_SITE,
      requestBody: { startDate: range.start, endDate: range.end, dimensions: [] },
    }),
    sc.searchanalytics.query({
      siteUrl: SC_SITE,
      requestBody: {
        startDate: range.start, endDate: range.end,
        dimensions: ["query"], rowLimit: 10,
        orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
      },
    }),
    sc.searchanalytics.query({
      siteUrl: SC_SITE,
      requestBody: {
        startDate: range.start, endDate: range.end,
        dimensions: ["page"], rowLimit: 10,
        orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
      },
    }),
    sc.searchanalytics.query({
      siteUrl: SC_SITE,
      requestBody: {
        startDate: range.start, endDate: range.end,
        dimensions: ["device"],
        orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
      },
    }),
  ]);

  const t = totalsRes.data.rows?.[0];
  if (!t) return null;

  return {
    totals: {
      clicks: t.clicks ?? 0,
      impressions: t.impressions ?? 0,
      ctr: (t.ctr ?? 0) * 100,
      position: t.position ?? 0,
    },
    topQueries: (queriesRes.data.rows ?? []).map((r) => ({
      key: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      position: r.position ?? 0,
      ctr: (r.ctr ?? 0) * 100,
    })),
    topPages: (pagesRes.data.rows ?? []).map((r) => ({
      key: (r.keys?.[0] ?? "")
        .replace("https://www.vitaromagna.it", "")
        .replace("https://vitaromagna.it", ""),
      clicks: r.clicks ?? 0,
      position: r.position ?? 0,
      ctr: (r.ctr ?? 0) * 100,
    })),
    devices: (devicesRes.data.rows ?? []).map((r) => ({
      device: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      ctr: (r.ctr ?? 0) * 100,
      position: r.position ?? 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Umami — fetch
// ---------------------------------------------------------------------------

async function fetchUmami(range: ReturnType<typeof dateRange>): Promise<UmamiData | null> {
  const apiKey = env["UMAMI_API_KEY"];
  if (!apiKey) return null;

  const headers = { "x-umami-api-key": apiKey, "Content-Type": "application/json" };
  const qs = `startAt=${range.startMs}&endAt=${range.endMs}`;

  const statsRes = await fetch(`${UMAMI_API}/websites/${UMAMI_WEBSITE_ID}/stats?${qs}`, { headers });
  if (!statsRes.ok) return null;
  const stats = await statsRes.json() as Record<string, number>;

  const totalSessions = stats.visits ?? 0;
  const bounceRate = totalSessions > 0 ? ((stats.bounces ?? 0) / totalSessions * 100) : 0;
  const avgSec = totalSessions > 0 ? Math.round((stats.totaltime ?? 0) / totalSessions) : 0;

  const [pagesRes, devRes, countryRes] = await Promise.all([
    fetch(`${UMAMI_API}/websites/${UMAMI_WEBSITE_ID}/metrics?${qs}&type=url&limit=10`, { headers }),
    fetch(`${UMAMI_API}/websites/${UMAMI_WEBSITE_ID}/metrics?${qs}&type=device&limit=5`, { headers }),
    fetch(`${UMAMI_API}/websites/${UMAMI_WEBSITE_ID}/metrics?${qs}&type=country&limit=5`, { headers }),
  ]);

  const topPages = pagesRes.ok
    ? ((await pagesRes.json()) as Array<{ x: string; y: number }>).map((p) => ({ url: p.x, views: p.y }))
    : [];
  const devices = devRes.ok
    ? ((await devRes.json()) as Array<{ x: string; y: number }>).map((d) => ({ device: d.x ?? "unknown", sessions: d.y }))
    : [];
  const countries = countryRes.ok
    ? ((await countryRes.json()) as Array<{ x: string; y: number }>).map((c) => ({ country: (c.x ?? "??").toUpperCase(), sessions: c.y }))
    : [];

  return {
    visitors: stats.visitors ?? 0,
    sessions: totalSessions,
    pageviews: stats.pageviews ?? 0,
    bounceRate,
    avgDurationSec: avgSec,
    topPages,
    devices,
    countries,
  };
}

// ---------------------------------------------------------------------------
// DB — fetch
// ---------------------------------------------------------------------------

async function fetchDbStats(): Promise<DbData | null> {
  const dbUrl = env["DATABASE_URL"];
  if (!dbUrl) return null;

  const directUrl = dbUrl.includes("pooler.supabase.com")
    ? (() => {
        const m = dbUrl.match(/:\/\/postgres\.([^:]+):([^@]+)@/);
        if (!m) return dbUrl;
        const [, projectRef, password] = m;
        return `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;
      })()
    : dbUrl;

  const sql = postgres(directUrl, { ssl: "require", max: 3, connect_timeout: 15 });

  try {
    const [
      users, establishments, establishmentsClaimed,
      jobsManual, jobsTotal,
      accommodationsManual, accommodationsTotal,
      talentsUser, talentsTotal,
      eventsUser, eventsTotal,
    ] = await Promise.all([
      sql`SELECT COUNT(*) FROM profiles`,
      sql`SELECT COUNT(*) FROM establishments`,
      sql`SELECT COUNT(*) FROM establishments WHERE owner_user_id IS NOT NULL`,
      sql`SELECT COUNT(*) FROM jobs WHERE source = 'MANUAL'`,
      sql`SELECT COUNT(*) FROM jobs`,
      sql`SELECT COUNT(*) FROM accommodations WHERE source = 'MANUAL'`,
      sql`SELECT COUNT(*) FROM accommodations`,
      sql`SELECT COUNT(*) FROM talents WHERE user_id IS NOT NULL`,
      sql`SELECT COUNT(*) FROM talents`,
      sql`SELECT COUNT(*) FROM events WHERE source = 'USER' OR (user_id IS NOT NULL AND source NOT IN ('API_ERT','RSS_RICCIONE','RSS_RIMINI','RSS_CESENATICO','RSS_CERVIA','ESTABLISHMENT'))`,
      sql`SELECT COUNT(*) FROM events`,
    ]);

    return {
      users: Number(users[0].count),
      establishments: Number(establishments[0].count),
      establishmentsClaimed: Number(establishmentsClaimed[0].count),
      jobsTotal: Number(jobsTotal[0].count),
      jobsManual: Number(jobsManual[0].count),
      accommodationsTotal: Number(accommodationsTotal[0].count),
      accommodationsManual: Number(accommodationsManual[0].count),
      talentsTotal: Number(talentsTotal[0].count),
      talentsUser: Number(talentsUser[0].count),
      eventsTotal: Number(eventsTotal[0].count),
      eventsUser: Number(eventsUser[0].count),
    };
  } finally {
    await sql.end();
  }
}

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------

function printSearchConsole(sc: ScData) {
  bar("GOOGLE SEARCH CONSOLE");
  console.log("");
  row("Click totali", num(sc.totals.clicks));
  row("Impressioni", num(sc.totals.impressions));
  row("CTR medio", `${sc.totals.ctr.toFixed(2)}%`);
  row("Posizione media", sc.totals.position.toFixed(1));

  console.log("\n  TOP 10 QUERY");
  sc.topQueries.forEach((r, i) => {
    const q = r.key.slice(0, 40).padEnd(40);
    console.log(`  ${String(i + 1).padStart(2)}. ${q}  ${String(r.clicks).padStart(5)} click  pos ${r.position.toFixed(1)}`);
  });

  console.log("\n  TOP 10 PAGINE");
  sc.topPages.forEach((r, i) => {
    const p = r.key.slice(0, 50).padEnd(50);
    console.log(`  ${String(i + 1).padStart(2)}. ${p}  ${String(r.clicks).padStart(5)} click  pos ${r.position.toFixed(1)}`);
  });

  console.log("\n  DISPOSITIVI");
  sc.devices.forEach((r) => {
    const d = r.device.padEnd(10);
    console.log(`  ${d}  ${String(r.clicks).padStart(5)} click  CTR ${r.ctr.toFixed(1)}%  pos ${r.position.toFixed(1)}`);
  });
}

function printUmami(u: UmamiData) {
  bar("UMAMI ANALYTICS");
  console.log("");
  row("Visitatori unici", num(u.visitors));
  row("Sessioni", num(u.sessions));
  row("Pageview", num(u.pageviews));
  row("Bounce rate", `${u.bounceRate.toFixed(1)}%`);
  row("Durata media sessione", `${Math.floor(u.avgDurationSec / 60)}m ${u.avgDurationSec % 60}s`);

  console.log("\n  TOP 10 PAGINE");
  u.topPages.forEach((p, i) => {
    const url = p.url.slice(0, 50).padEnd(50);
    console.log(`  ${String(i + 1).padStart(2)}. ${url}  ${String(p.views).padStart(6)} views`);
  });

  console.log("\n  DISPOSITIVI");
  u.devices.forEach((d) => {
    console.log(`  ${(d.device).padEnd(12)}  ${String(d.sessions).padStart(6)} sessioni`);
  });

  console.log("\n  TOP 5 PAESI");
  u.countries.forEach((c) => {
    console.log(`  ${c.country.padEnd(6)}  ${String(c.sessions).padStart(6)} sessioni`);
  });
}

function printDb(db: DbData) {
  bar("PIATTAFORMA — DATI DB");
  console.log("");
  row("Utenti registrati", num(db.users));
  console.log("");
  row("Stabilimenti totali", num(db.establishments));
  row("  → riscattati da utenti", num(db.establishmentsClaimed));
  console.log("");
  row("Annunci lavoro totali", num(db.jobsTotal));
  row("  → inseriti a mano (MANUAL)", num(db.jobsManual));
  console.log("");
  row("Alloggi totali", num(db.accommodationsTotal));
  row("  → inseriti a mano (MANUAL)", num(db.accommodationsManual));
  console.log("");
  row("Talenti totali", num(db.talentsTotal));
  row("  → creati da utenti", num(db.talentsUser));
  console.log("");
  row("Eventi totali", num(db.eventsTotal));
  row("  → inseriti da utenti", num(db.eventsUser));
}

// ---------------------------------------------------------------------------
// Markdown report writer
// ---------------------------------------------------------------------------

function writeMarkdownReport(
  range: ReturnType<typeof dateRange>,
  sc: ScData | null,
  u: UmamiData | null,
  db: DbData | null,
  today: string,
) {
  const lines: string[] = [];
  const p = (...args: string[]) => lines.push(...args);

  p(
    `# Report Statistiche VitaRomagna — ${today}`,
    ``,
    `> Periodo: **${range.start}** → **${range.end}** (${DAYS} giorni)  `,
    `> Ambiente: **${USE_LOCAL ? "LOCAL" : "PRODUCTION"}**`,
    ``,
    `---`,
    ``,
  );

  // Search Console
  if (sc) {
    p(
      `## Google Search Console`,
      ``,
      `| Metrica | Valore |`,
      `|---|---|`,
      `| Click totali | **${num(sc.totals.clicks)}** |`,
      `| Impressioni | **${num(sc.totals.impressions)}** |`,
      `| CTR medio | **${sc.totals.ctr.toFixed(2)}%** |`,
      `| Posizione media | **${sc.totals.position.toFixed(1)}** |`,
      ``,
      `### Top 10 Query`,
      ``,
      `| # | Query | Click | Posizione |`,
      `|---|---|---|---|`,
    );
    sc.topQueries.forEach((r, i) => {
      p(`| ${i + 1} | ${r.key} | ${num(r.clicks)} | ${r.position.toFixed(1)} |`);
    });
    p(
      ``,
      `### Top 10 Pagine (click organici)`,
      ``,
      `| # | Pagina | Click | Posizione |`,
      `|---|---|---|---|`,
    );
    sc.topPages.forEach((r, i) => {
      p(`| ${i + 1} | \`${r.key}\` | ${num(r.clicks)} | ${r.position.toFixed(1)} |`);
    });
    p(
      ``,
      `### Dispositivi`,
      ``,
      `| Dispositivo | Click | CTR | Posizione media |`,
      `|---|---|---|---|`,
    );
    sc.devices.forEach((r) => {
      p(`| ${r.device} | ${num(r.clicks)} | ${r.ctr.toFixed(1)}% | ${r.position.toFixed(1)} |`);
    });
    p(``, `---`, ``);
  } else {
    p(`## Google Search Console`, ``, `> Dati non disponibili.`, ``, `---`, ``);
  }

  // Umami
  if (u) {
    const avgMin = Math.floor(u.avgDurationSec / 60);
    const avgSec = u.avgDurationSec % 60;
    p(
      `## Umami Analytics`,
      ``,
      `| Metrica | Valore |`,
      `|---|---|`,
      `| Visitatori unici | **${num(u.visitors)}** |`,
      `| Sessioni | **${num(u.sessions)}** |`,
      `| Pageview | **${num(u.pageviews)}** |`,
      `| Bounce rate | **${u.bounceRate.toFixed(1)}%** |`,
      `| Durata media sessione | **${avgMin}m ${avgSec}s** |`,
      ``,
      `### Top 10 Pagine (pageview)`,
      ``,
      `| # | Pagina | Pageview |`,
      `|---|---|---|`,
    );
    u.topPages.forEach((p2, i) => {
      p(`| ${i + 1} | \`${p2.url}\` | ${num(p2.views)} |`);
    });
    p(
      ``,
      `### Dispositivi`,
      ``,
      `| Dispositivo | Sessioni |`,
      `|---|---|`,
    );
    u.devices.forEach((d) => p(`| ${d.device} | ${num(d.sessions)} |`));
    p(
      ``,
      `### Top 5 Paesi`,
      ``,
      `| Paese | Sessioni |`,
      `|---|---|`,
    );
    u.countries.forEach((c) => p(`| ${c.country} | ${num(c.sessions)} |`));
    p(``, `---`, ``);
  } else {
    p(`## Umami Analytics`, ``, `> Dati non disponibili.`, ``, `---`, ``);
  }

  // DB
  if (db) {
    p(
      `## Piattaforma — Snapshot DB`,
      ``,
      `| Entità | Totale | Di cui utenti/manual |`,
      `|---|---|---|`,
      `| Utenti registrati | **${num(db.users)}** | — |`,
      `| Stabilimenti | **${num(db.establishments)}** | ${num(db.establishmentsClaimed)} riscattati |`,
      `| Annunci lavoro | **${num(db.jobsTotal)}** | ${num(db.jobsManual)} manual |`,
      `| Alloggi | **${num(db.accommodationsTotal)}** | ${num(db.accommodationsManual)} manual |`,
      `| Talenti | **${num(db.talentsTotal)}** | ${num(db.talentsUser)} da utenti |`,
      `| Eventi (totale DB) | **${num(db.eventsTotal)}** | ${num(db.eventsUser)} da utenti |`,
      ``,
      `---`,
      ``,
    );
  }

  p(`*Generato automaticamente da \`pnpm stats --report\` il ${today}.*`);

  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const filePath = path.join(REPORT_DIR, `${today}.md`);
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  console.log(`\n  Report salvato → ${filePath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const range = dateRange(DAYS);
  const envLabel = USE_LOCAL ? "LOCAL" : "PRODUCTION";
  const today = new Date().toISOString().split("T")[0];

  console.log("\n");
  console.log("═".repeat(62));
  console.log(`  VITAROMAGNA — STATS  |  ultimi ${DAYS} giorni  |  ${envLabel}`);
  console.log(`  ${range.start}  →  ${range.end}`);
  console.log("═".repeat(62));

  const [sc, u, db] = await Promise.all([
    fetchSearchConsole(range).catch((e) => { console.error("  SC error:", e.message); return null; }),
    fetchUmami(range).catch((e) => { console.error("  Umami error:", e.message); return null; }),
    fetchDbStats().catch((e) => { console.error("  DB error:", e.message); return null; }),
  ]);

  if (sc) printSearchConsole(sc); else { bar("GOOGLE SEARCH CONSOLE"); console.log("  Dati non disponibili"); }
  if (u) printUmami(u); else { bar("UMAMI ANALYTICS"); console.log("  Dati non disponibili"); }
  if (db) printDb(db); else { bar("PIATTAFORMA — DATI DB"); console.log("  Dati non disponibili"); }

  console.log("\n" + "═".repeat(62) + "\n");

  if (WRITE_REPORT) writeMarkdownReport(range, sc, u, db, today);
}

main().catch((e) => {
  console.error("\nERRORE:", e.message ?? e);
  process.exit(1);
});
