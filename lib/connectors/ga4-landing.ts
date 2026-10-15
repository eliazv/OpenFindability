import { createHash } from "node:crypto";
import { ga4AccessToken } from "./ga4";
import type { AppData, Project, SyncResult } from "@/lib/types";

type LandingRow = NonNullable<AppData["ga4LandingMetrics"]>[number];
export const LANDING_DIMENSIONS = ["date", "hostName", "landingPage", "sessionDefaultChannelGroup", "sessionSourceMedium", "deviceCategory"];
export const LANDING_METRICS = ["sessions", "engagedSessions", "keyEvents", "sessionKeyEventRate"];
type Report = {
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
  rowCount?: number;
  metadata?: { timeZone?: string; subjectToThresholding?: boolean; dataLossFromOtherRow?: boolean; samplingMetadatas?: unknown[] };
};

export function normalizeLandingRows(projectId: string, report: Report, fetchedAt: string): LandingRow[] {
  return (report.rows ?? []).map(row => {
    const dimensions = LANDING_DIMENSIONS.map((_,i) => row.dimensionValues?.[i]?.value);
    if (dimensions.some(v => v === undefined)) throw new Error("GA4 landing: missing dimension.");
    const [compact,hostname,landingPage,channel,sourceMedium,device] = dimensions as string[];
    const date = `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}`;
    if (!/^\d{8}$/.test(compact) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error("GA4 landing: invalid date.");
    const values = LANDING_METRICS.map((_,i) => {
      const raw = row.metricValues?.[i]?.value;
      const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
      if (!Number.isFinite(value) || value < 0 || (i < 2 && !Number.isSafeInteger(value)) || (i===3 && value>1)) throw new Error("GA4 landing: invalid metric.");
      return value;
    });
    if (values[1] > values[0]) throw new Error("GA4 landing: engaged sessions exceed sessions.");
    const quality = [report.metadata?.subjectToThresholding && "thresholded", report.metadata?.dataLossFromOtherRow && "other_row", report.metadata?.samplingMetadatas?.length && "sampled"].filter(Boolean).join(",") || "standard";
    return { id: createHash("sha256").update(JSON.stringify([projectId,...dimensions])).digest("hex"), projectId,date,hostname,landingPage,channel,sourceMedium,device,
      sessions: values[0], engagedSessions: values[1], keyEvents: values[2], sessionKeyEventRate: values[3],
      timeZone: report.metadata?.timeZone ?? null, quality, rawJson: { row, metadata: report.metadata, dimensions: LANDING_DIMENSIONS, metrics: LANDING_METRICS }, fetchedAt };
  });
}

export async function syncGa4LandingProject(project: Project, startDate: string, endDate: string, request: typeof fetch = fetch, tokenProvider=ga4AccessToken): Promise<{ result: SyncResult; rows: LandingRow[]; replace: boolean }> {
  const result = (status: SyncResult["status"], message: string, rows: LandingRow[] = [], replace=false) => ({result:{source:"ga4_landing" as const,projectId:project.id,status,message,inserted:{snapshots:0,queries:0,pages:0,observations:rows.length}},rows,replace});
  if (!project.ga4PropertyId || !project.websiteUrl) return result("skipped","GA4 property and website URL are required for web landing reports.");
  const property = project.ga4PropertyId.replace(/^properties\//,"");
  if (!/^\d+$/.test(property)) throw new Error("GA4 property ID must be numeric.");
  const token = await tokenProvider();
  if (!token) return result("skipped","Google service account is not configured.");
  const base = `https://analyticsdata.googleapis.com/v1beta/properties/${property}`;
  const post = async (method: string, body: unknown) => {
    const response = await request(`${base}:${method}`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error(`GA4 ${method}: HTTP ${response.status}`);
    return response.json();
  };
  const dimensions = LANDING_DIMENSIONS.map(name=>({name})), metrics=LANDING_METRICS.map(name=>({name}));
  const host=new URL(project.websiteUrl).hostname;
  const hosts=[host, host.startsWith("www.") ? host.slice(4) : `www.${host}`];
  const dimensionFilter={filter:{fieldName:"hostName",inListFilter:{values:hosts,caseSensitive:false}}};
  const compatibility = await post("checkCompatibility",{dimensions,metrics,dimensionFilter}) as { dimensionCompatibilities?: {dimensionMetadata?:{apiName?:string};compatibility?:string}[];metricCompatibilities?:{metricMetadata?:{apiName?:string};compatibility?:string}[] };
  if (LANDING_DIMENSIONS.some(name=>!compatibility.dimensionCompatibilities?.some(e=>e.dimensionMetadata?.apiName===name && e.compatibility==="COMPATIBLE")) || LANDING_METRICS.some(name=>!compatibility.metricCompatibilities?.some(e=>e.metricMetadata?.apiName===name && e.compatibility==="COMPATIBLE"))) throw new Error("GA4 landing dimensions/metrics are incompatible or unverified for this property.");
  const fetchedAt=new Date().toISOString(); const rows: LandingRow[]=[]; let total: number|undefined;
  for (let offset=0;offset<250000;offset+=10000) {
    const report=await post("runReport",{dateRanges:[{startDate,endDate}],dimensions,metrics,
      dimensionFilter,
      orderBys:LANDING_DIMENSIONS.map(dimensionName=>({dimension:{dimensionName}})),limit:10000,offset}) as Report;
    const count=report.rowCount??0;
    if (!Number.isSafeInteger(count) || count<0 || (total!==undefined && count!==total)) throw new Error("GA4 landing row count changed while paging; retry.");
    total=count;
    rows.push(...normalizeLandingRows(project.id,report,fetchedAt));
    if (rows.length===count) {
      if (new Set(rows.map(r=>r.id)).size!==rows.length) throw new Error("GA4 landing duplicate rows across pages.");
      if (rows.some(r=>r.date<startDate || r.date>endDate)) throw new Error("GA4 landing date outside requested range.");
      const partial=rows.some(r=>r.quality!=="standard");
      return result(partial?"partial":rows.length?"success":"no_data",`${rows.length} landing/channel/device rows; property key events, not business-goal validation.`,rows,true);
    }
    if (!report.rows?.length || rows.length>count) throw new Error("GA4 landing incomplete pagination.");
  }
  throw new Error("GA4 landing exceeds 250000 rows; use a shorter date range.");
}
