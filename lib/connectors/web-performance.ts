import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import type { AppData } from "@/lib/types";

export type PerformanceRow = NonNullable<AppData["webPerformanceMetrics"]>[number];
export type PerformanceSource = "pagespeed" | "crux";
export type Device = "mobile" | "desktop";

export function publicPageUrl(input: string, website?: string): string {
  const url=new URL(input,website);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.port || isIP(url.hostname.replace(/^\[|\]$/g,"")) || !url.hostname.includes(".") || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) throw new Error("A public HTTP(S) URL without credentials, custom ports or IP literals is required.");
  if (website && url.origin!==new URL(website).origin) throw new Error("URL must use the configured project origin.");
  url.search=""; url.hash="";
  return url.toString();
}

function emptyRow(projectId:string,source:PerformanceSource,url:string,scope:"url"|"origin",device:Device,fetchedAt:string):PerformanceRow {
  const date=fetchedAt.slice(0,10);
  return {id:createHash("sha256").update(JSON.stringify([projectId,source,url,scope,device,date])).digest("hex"),projectId,source,url,scope,device,date,status:"available",periodStart:null,periodEnd:null,lcpMs:null,inpMs:null,cls:null,fcpMs:null,tbtMs:null,performanceScore:null,finalUrl:null,version:null,rawJson:null,fetchedAt};
}
const numeric=z.number().finite().nonnegative().nullable().optional();
const audit=z.object({numericValue:numeric}).passthrough();
const psiSchema=z.object({lighthouseResult:z.object({fetchTime:z.string().optional(),finalUrl:z.string().optional(),lighthouseVersion:z.string().optional(),runtimeError:z.unknown().optional(),categories:z.object({performance:z.object({score:z.number().min(0).max(1).nullable()})}),audits:z.record(z.string(),audit)}).passthrough()}).passthrough();

export function normalizePageSpeed(projectId:string,url:string,device:Device,payload:unknown,fetchedAt:string):PerformanceRow {
  const data=psiSchema.parse(payload).lighthouseResult;
  if (data.runtimeError) throw new Error("PageSpeed Lighthouse runtime error; no valid measurement.");
  const row=emptyRow(projectId,"pagespeed",url,"url",device,fetchedAt);
  row.lcpMs=data.audits["largest-contentful-paint"]?.numericValue??null;
  row.cls=data.audits["cumulative-layout-shift"]?.numericValue??null;
  row.fcpMs=data.audits["first-contentful-paint"]?.numericValue??null;
  row.tbtMs=data.audits["total-blocking-time"]?.numericValue??null;
  row.performanceScore=data.categories.performance.score;
  if (row.performanceScore===null || row.lcpMs===null) throw new Error("PageSpeed returned incomplete lab metrics.");
  row.finalUrl=data.finalUrl?publicPageUrl(data.finalUrl):null;
  row.version=data.lighthouseVersion??null; row.rawJson=payload;
  return row;
}
const cruxDate=z.object({year:z.number().int(),month:z.number().int(),day:z.number().int()}).transform(d=>`${d.year}-${String(d.month).padStart(2,"0")}-${String(d.day).padStart(2,"0")}`);
const percentile=z.union([z.number(),z.string()]).transform(Number).pipe(z.number().finite().nonnegative());
const cruxSchema=z.object({record:z.object({key:z.object({url:z.string().optional(),origin:z.string().optional(),formFactor:z.string().optional()}),collectionPeriod:z.object({firstDate:cruxDate,lastDate:cruxDate}),metrics:z.record(z.string(),z.object({percentiles:z.object({p75:percentile}).optional()}).passthrough())}).passthrough()}).passthrough();

export function normalizeCrux(projectId:string,url:string,scope:"url"|"origin",device:Device,payload:unknown,fetchedAt:string):PerformanceRow {
  const data=cruxSchema.parse(payload).record;
  if ((scope==="url"?data.key.url:data.key.origin)!==url || data.key.formFactor!==(device==="mobile"?"PHONE":"DESKTOP")) throw new Error("CrUX returned another scope or device.");
  const row=emptyRow(projectId,"crux",url,scope,device,fetchedAt);
  row.periodStart=data.collectionPeriod.firstDate; row.periodEnd=data.collectionPeriod.lastDate;
  if (![row.periodStart,row.periodEnd].every(d=>Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d) || row.periodStart>row.periodEnd) throw new Error("CrUX returned invalid collection dates.");
  row.lcpMs=data.metrics.largest_contentful_paint?.percentiles?.p75??null;
  row.inpMs=data.metrics.interaction_to_next_paint?.percentiles?.p75??null;
  row.cls=data.metrics.cumulative_layout_shift?.percentiles?.p75??null;
  if (row.lcpMs===null && row.inpMs===null && row.cls===null) throw new Error("CrUX returned no supported percentiles.");
  row.rawJson=payload;
  return row;
}

export async function fetchPerformance(projectId:string,source:PerformanceSource,url:string,scope:"url"|"origin",device:Device,request:typeof fetch=fetch):Promise<PerformanceRow> {
  const fetchedAt=new Date().toISOString();
  let endpoint:URL, options:RequestInit;
  if (source==="crux") {
    if (!process.env.CRUX_API_KEY) throw new Error("Configure CRUX_API_KEY for Chrome UX Report API.");
    endpoint=new URL("https://chromeuxreport.googleapis.com/v1/records:queryRecord"); endpoint.searchParams.set("key",process.env.CRUX_API_KEY);
    options={method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({[scope]:url,formFactor:device==="mobile"?"PHONE":"DESKTOP",metrics:["largest_contentful_paint","interaction_to_next_paint","cumulative_layout_shift"]})};
  } else {
    if (scope!=="url") throw new Error("PageSpeed supports URL lab measurements only.");
    endpoint=new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url",url); endpoint.searchParams.set("strategy",device); endpoint.searchParams.set("category","performance");
    if (process.env.PAGESPEED_API_KEY) endpoint.searchParams.set("key",process.env.PAGESPEED_API_KEY);
    options={};
  }
  let response:Response;
  try { response=await request(endpoint,{...options,signal:AbortSignal.timeout(120000)}); }
  catch { throw new Error(`${source}: request failed or timed out (credentials omitted).`); }
  if (source==="crux" && response.status===404) {
    const body=await response.json() as {error?:{status?:string}};
    if (body.error?.status==="NOT_FOUND") return {...emptyRow(projectId,source,url,scope,device,fetchedAt),status:"no_data",rawJson:body};
  }
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}; check API enablement, quota and key restrictions.`);
  const payload:unknown=await response.json();
  return source==="pagespeed"?normalizePageSpeed(projectId,url,device,payload,fetchedAt):normalizeCrux(projectId,url,scope,device,payload,fetchedAt);
}

export function performanceSample(website:string,pages:{page:string;impressions:number}[],limit=3):string[] {
  if (!Number.isSafeInteger(limit) || limit<1 || limit>10) throw new Error("Performance sample limit must be 1..10.");
  const candidates=[publicPageUrl(website),...pages.slice().sort((a,b)=>b.impressions-a.impressions).flatMap(p=>{try{return [publicPageUrl(p.page,website)];}catch{return [];}})];
  return [...new Set(candidates)].slice(0,limit);
}
