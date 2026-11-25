"use client";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMetric, type MetricResult } from "@/lib/dashboard/metrics";
import type { MetricSpec } from "@/lib/dashboard/read-model";
import { CONNECTOR_CATALOG } from "@/lib/connectors/catalog";
import { Sparkline } from "@/components/ui/sparkline";
import {SourceIcon} from "./source-icon";
import { Download } from "lucide-react";
import { csvText } from "@/lib/dashboard/csv";
import { DeltaBadge } from "@/components/ui/delta-badge";

const config={current:{label:"Corrente",color:"var(--chart-1)"},previous:{label:"Precedente",color:"var(--muted-foreground)"}} satisfies ChartConfig;
type Props={spec:MetricSpec;result:MetricResult;latest?:string};
export function MetricCard({spec,result:m,latest}:Props){
 const sparse=spec.kind==="snapshot";
 const lastValue=m.points.findLast(p=>p.current!==null)?.date;
 const detail=CONNECTOR_CATALOG[spec.source].label+" · "+m.range.from+" – "+m.range.to+" · "+m.observed+"/"+m.expected+" giorni osservati";
 return <Card className="min-w-0 h-full gap-1 py-3 shadow-none"><CardHeader className="px-3 pb-0"><CardTitle className="text-xs font-medium text-muted-foreground"><span className="flex items-center gap-1.5"><SourceIcon source={spec.source}/>{spec.label}</span></CardTitle></CardHeader><CardContent className="px-3">
 <div className="text-xl lg:text-2xl font-semibold tabular-nums truncate" title={formatMetric(m.value,spec.unit,m.currency,spec.precision)}>{formatMetric(m.value,spec.unit,m.currency,spec.precision)}</div>
 <div className="flex items-center justify-between gap-2">{m.delta===null?null:spec.kind==="ratio"?<DeltaBadge delta={m.delta} invert={spec.lowerBetter} variant="soft">{m.delta>0?"+":""}{formatMetric(m.delta,"decimal")} {spec.unit==="percent"?"pp":"pos."}</DeltaBadge>:m.deltaPercent===null?<span className="text-xs tabular-nums">{m.delta>0?"+":""}{formatMetric(m.delta,spec.unit,m.currency)}</span>:<DeltaBadge delta={m.deltaPercent/100} invert={spec.lowerBetter} variant="soft"/>}
 {m.observed>1&&<Sparkline data={m.points.map(p=>p.current)} className="w-16 h-7 shrink-0"/>}</div>
 <p title={detail} className="text-xs text-muted-foreground">{m.value===null?"Nessun dato":sparse?lastValue?"Al "+lastValue:"Nessuna misura":m.observed<m.expected?m.observed+"/"+m.expected+" giorni":"Al "+(latest??m.range.to)}</p>{m.warning&&<p className="text-xs text-warning">{m.warning}</p>}
 </CardContent></Card>;
}
export function MetricSeries({spec,result:m,annotations=[]}:Props & {annotations?:{date:string;title:string}[]}){
 const format=(v:number)=>formatMetric(v,spec.unit,m.currency,spec.precision);
 const inWindow=annotations.filter(a=>a.date>=m.range.from&&a.date<=m.range.to);
 function exportSeries(){const csv=csvText(["Data","Corrente","Data precedente","Precedente","Valuta"],m.points.map(p=>[p.date,p.current,p.previousDate,p.previous,m.currency]));const url=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=spec.source+"-"+spec.key+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <Card className="min-w-0 gap-3 py-4"><CardHeader className="flex flex-row items-center justify-between gap-2"><div className="min-w-0"><CardTitle className="text-base">{spec.label}</CardTitle><p className="text-xs text-muted-foreground">{m.range.from} – {m.range.to}{m.currency?" · "+m.currency:""}</p></div><button type="button" onClick={exportSeries} disabled={!m.observed} title="Esporta serie CSV" aria-label="Esporta serie CSV" className="size-8 shrink-0 inline-flex items-center justify-center rounded-md border text-muted-foreground hover:bg-muted disabled:opacity-40"><Download className="size-4"/></button></CardHeader><CardContent>
 {m.observed===0?<p className="py-12 text-center text-sm text-muted-foreground">{m.warning??"Nessuna misura disponibile."}</p>:<>
 <ChartContainer config={config} className="h-[280px] w-full aspect-auto"><LineChart data={m.points} accessibilityLayer><CartesianGrid vertical={false}/><XAxis dataKey="date" tickFormatter={(v:string)=>v.slice(5)} minTickGap={25}/><YAxis width={75} tickFormatter={format} reversed={spec.key==="avgPosition"||spec.key==="appRank"}/><ChartTooltip content={<ChartTooltipContent formatter={(v,name,item)=> <span className="tabular-nums">{name==="previous"?"Precedente "+item.payload.previousDate:"Corrente"}: {typeof v==="number"?format(v):"—"}</span>}/>}/>{inWindow.slice(0,20).map((a,i)=><ReferenceLine key={i} x={a.date} stroke="var(--chart-2)" strokeDasharray="3 3" />)}<Line dataKey="current" type="linear" stroke="var(--chart-1)" strokeWidth={2} dot={m.observed<=7} connectNulls={false} isAnimationActive={false}/>{m.previousObserved>0&&<Line dataKey="previous" type="linear" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={m.previousObserved<=7} connectNulls={false} isAnimationActive={false}/>}</LineChart></ChartContainer>
 <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-primary"/>Corrente</span>{m.previousObserved>0&&<span className="inline-flex items-center gap-1.5" title={m.previousRange.from+" – "+m.previousRange.to}><span className="w-4 border-t-2 border-dashed border-muted-foreground"/>Precedente</span>}{inWindow.length>0&&<span title={inWindow.map(a=>a.date+" · "+a.title).join("\n")}>{inWindow.length} interventi</span>}<span className="sr-only">Valore corrente {formatMetric(m.value,spec.unit,m.currency,spec.precision)}; precedente {formatMetric(m.previous,spec.unit,m.currency,spec.precision)}. Esportazione CSV disponibile.</span></div></>}
 </CardContent></Card>;
}
