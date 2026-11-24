import type { MetricSnapshot } from "@/lib/types";

export type Range = { from: string; to: string };
export type Observation = { date: string; value: number | null; currency?: string };
export type MetricKind = "sum" | "snapshot";
export type MetricResult = {
  value: number | null; previous: number | null; delta: number | null; deltaPercent: number | null;
  range: Range; previousRange: Range; observed: number; expected: number; previousObserved: number;
  currency?: string; warning?: string; points: { date: string; current: number | null; previous: number | null; previousDate: string }[];
};
export function shiftDay(day: string, offset: number): string {
  const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0,10);
}
export function dayRange(to: string, days: number): Range { return { from: shiftDay(to, 1-days), to }; }
export function inRange(date: string, range: Range): boolean { return date >= range.from && date <= range.to; }
export function parseDays(value: string | string[] | undefined): number { return value === "7" ? 7 : value === "90" ? 90 : value === "365" ? 365 : 28; }
export function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
export function latestDay(rows: {date:string}[]): string | undefined {
  return rows.reduce<string | undefined>((max,r) => validDay(r.date) && (!max || r.date > max) ? r.date : max, undefined);
}
export function snapshotObservations(rows: MetricSnapshot[], key: keyof MetricSnapshot): Observation[] {
  const map = new Map<string, MetricSnapshot>();
  for (const row of rows) if (!map.has(row.date) || map.get(row.date)!.createdAt < row.createdAt) map.set(row.date,row);
  return [...map.values()].map(row => ({ date:row.date, value: typeof row[key] === "number" ? row[key] as number : null, currency:row.currency }));
}
export function measure(rows: Observation[], range: Range, kind: MetricKind = "sum", monetary = false): MetricResult {
  const expected = Math.round((Date.parse(range.to)-Date.parse(range.from))/86400000)+1;
  if (!Number.isInteger(expected) || expected < 1 || expected > 366) throw new Error("Invalid metric range");
  const previousRange = dayRange(shiftDay(range.from,-1),expected);
  const relevant = rows.filter(r => inRange(r.date,range)||inRange(r.date,previousRange));
  const valid = relevant.filter(r => r.value !== null && Number.isFinite(r.value));
  const currencies = new Set(valid.map(r=>r.currency));
  const invalidCurrency = monetary && (currencies.size > 1 || currencies.has(undefined) || currencies.has(""));
  const currency = monetary && !invalidCurrency ? valid[0]?.currency : undefined;
  const map = new Map(valid.map(r=>[r.date,r.value!]));
  const points = Array.from({length:expected},(_,i)=>{
    const date=shiftDay(range.from,i), previousDate=shiftDay(previousRange.from,i);
    return {date,previousDate,current:invalidCurrency?null:map.get(date)??null,previous:invalidCurrency?null:map.get(previousDate)??null};
  });
  const current=points.flatMap(p=>p.current===null?[]:[p.current]), previous=points.flatMap(p=>p.previous===null?[]:[p.previous]);
  const aggregate=(a:number[])=>!a.length?null:kind==="snapshot"?a.at(-1)!:a.reduce((s,v)=>s+v,0);
  const value=aggregate(current), prior=aggregate(previous);
  // Flows require complete matching windows; snapshots require an observation at both endpoints.
  const comparable=kind==="sum"?current.length===expected&&previous.length===expected:
    points.at(-1)?.current!==null&&points.at(-1)?.previous!==null;
  const delta=comparable&&value!==null&&prior!==null?value-prior:null;
  return {value,previous:prior,delta,deltaPercent:delta!==null&&prior!==null&&prior!==0?delta/Math.abs(prior)*100:null,range,previousRange,observed:current.length,expected,previousObserved:previous.length,currency,warning:invalidCurrency?"Valute miste o mancanti: totale non disponibile.":undefined,points};
}
export function formatMetric(value: number|null|undefined, unit: "count"|"currency"|"percent"|"decimal" = "count", currency?:string, precision?:number): string {
  if(value==null||!Number.isFinite(value)) return "—";
  if(unit==="currency") { if(!currency||!/^[A-Z]{3}$/.test(currency)) return "—"; return value.toLocaleString("it-IT",{style:"currency",currency}); }
  return value.toLocaleString("it-IT",{maximumFractionDigits:precision??(unit==="count"?0:2)})+(unit==="percent"?"%":"");
}

export function measureRatio(rows:{date:string;numerator:number|null;denominator:number|null}[],range:Range,scale=1):MetricResult {
 const valid=rows.filter(r=>r.numerator!==null&&r.denominator!==null&&Number.isFinite(r.numerator)&&Number.isFinite(r.denominator)&&r.denominator>=0);
 const model=measure(valid.map(r=>({date:r.date,value:r.denominator!>0?r.numerator!/r.denominator!*scale:null})),range);
 const aggregate=(window:Range)=>{
  const subset=valid.filter(r=>inRange(r.date,window));
  const denominator=subset.reduce((s,r)=>s+r.denominator!,0);
  return {value:denominator>0?subset.reduce((s,r)=>s+r.numerator!,0)/denominator*scale:null,observed:new Set(subset.map(r=>r.date)).size};
 };
 const current=aggregate(range),previous=aggregate(model.previousRange);
 const delta=current.observed===model.expected&&previous.observed===model.expected&&current.value!==null&&previous.value!==null?current.value-previous.value:null;
 return {...model,value:current.value,previous:previous.value,observed:current.observed,previousObserved:previous.observed,delta,deltaPercent:delta!==null&&previous.value!==null&&previous.value!==0?delta/Math.abs(previous.value)*100:null};
}
