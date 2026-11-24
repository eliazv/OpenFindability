"use client";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMetric, type MetricResult } from "@/lib/dashboard/metrics";
import type { MetricSpec } from "@/lib/dashboard/read-model";
import { CONNECTOR_CATALOG } from "@/lib/connectors/catalog";
import { Sparkline } from "@/components/ui/sparkline";
import { DeltaBadge } from "@/components/ui/delta-badge";

const config={current:{label:"Corrente",color:"var(--chart-1)"},previous:{label:"Precedente",color:"var(--muted-foreground)"}} satisfies ChartConfig;
type Props={spec:MetricSpec;result:MetricResult;latest?:string};
export function MetricCard({spec,result:m,latest}:Props){
 const sparse=spec.kind==="snapshot";
 const lastValue=m.points.findLast(p=>p.current!==null)?.date;
 const detail=CONNECTOR_CATALOG[spec.source].label+" · "+m.range.from+" – "+m.range.to+" · "+m.observed+"/"+m.expected+" giorni osservati";
 return <Card className="min-w-0 h-full gap-1 py-4"><CardHeader className="px-4 pb-0"><CardTitle className="text-sm font-medium text-muted-foreground">{spec.label}</CardTitle></CardHeader><CardContent className="px-4">
 <div className="text-2xl font-semibold tabular-nums truncate" title={formatMetric(m.value,spec.unit,m.currency,spec.precision)}>{formatMetric(m.value,spec.unit,m.currency,spec.precision)}</div>
 <div className="flex items-center justify-between gap-2">{m.delta===null?<span className="text-xs text-muted-foreground" title="Periodo precedente non confrontabile">{m.value===null?"":"Confronto —"}</span>:spec.kind==="ratio"?<DeltaBadge delta={m.delta} invert={spec.lowerBetter} variant="soft">{m.delta>0?"+":""}{formatMetric(m.delta,"decimal")} {spec.unit==="percent"?"pp":"pos."}</DeltaBadge>:m.deltaPercent===null?<span className="text-xs tabular-nums">{m.delta>0?"+":""}{formatMetric(m.delta,spec.unit,m.currency)}</span>:<DeltaBadge delta={m.deltaPercent/100} invert={spec.lowerBetter} variant="soft"/>}
 {m.observed>1&&<Sparkline data={m.points.map(p=>p.current)} className="w-20 shrink-0"/>}</div>
 <p title={detail} className="text-xs text-muted-foreground">{m.value===null?"Nessun dato":sparse?lastValue?"Al "+lastValue:"Nessuna misura":m.observed<m.expected?m.observed+"/"+m.expected+" giorni · parziale":"Al "+(latest??m.range.to)}</p>{m.warning&&<p className="text-xs text-warning">{m.warning}</p>}
 </CardContent></Card>;
}
export function MetricSeries({spec,result:m,annotations=[]}:Props & {annotations?:{date:string;title:string}[]}){
 const format=(v:number)=>formatMetric(v,spec.unit,m.currency,spec.precision);
 return <Card className="min-w-0"><CardHeader><CardTitle className="text-base">{spec.label}</CardTitle><p className="text-xs text-muted-foreground">{CONNECTOR_CATALOG[spec.source].label} · {m.range.from} – {m.range.to}{m.currency?" · "+m.currency:""}</p></CardHeader><CardContent>
 {m.observed===0?<p className="py-12 text-center text-sm text-muted-foreground">{m.warning??"Nessuna misura disponibile."}</p>:<>
 <ChartContainer config={config} className="h-[280px] w-full aspect-auto"><LineChart data={m.points} accessibilityLayer><CartesianGrid vertical={false}/><XAxis dataKey="date" tickFormatter={(v:string)=>v.slice(5)} minTickGap={25}/><YAxis width={75} tickFormatter={format} reversed={spec.key==="avgPosition"||spec.key==="appRank"}/><ChartTooltip content={<ChartTooltipContent formatter={(v,name,item)=> <span className="tabular-nums">{name==="previous"?"Precedente "+item.payload.previousDate:"Corrente"}: {typeof v==="number"?format(v):"—"}</span>}/>}/>{annotations.filter(a=>a.date>=m.range.from&&a.date<=m.range.to).slice(0,20).map((a,i)=><ReferenceLine key={i} x={a.date} stroke="var(--chart-2)" strokeDasharray="3 3" />)}<Line dataKey="current" type="linear" stroke="var(--chart-1)" strokeWidth={2} dot={m.observed<=7} connectNulls={false} isAnimationActive={false}/><Line dataKey="previous" type="linear" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={m.previousObserved<=7} connectNulls={false} isAnimationActive={false}/></LineChart></ChartContainer>
 <p className="text-xs text-muted-foreground">Corrente — · precedente – – ({m.previousRange.from} – {m.previousRange.to})</p>
 {annotations.some(a=>a.date>=m.range.from&&a.date<=m.range.to)&&<details className="text-sm mt-2"><summary>Interventi nel periodo (linee verticali)</summary><ul className="list-disc pl-4">{annotations.filter(a=>a.date>=m.range.from&&a.date<=m.range.to).map((a,i)=><li key={i}>{a.date} · {a.title}</li>)}</ul></details>}<details className="mt-3 text-sm"><summary className="cursor-pointer">Dati del grafico</summary><div className="max-h-64 overflow-auto"><table className="w-full text-xs tabular-nums"><thead><tr><th className="text-left">Data</th><th className="text-right">Corrente</th><th className="text-right">Precedente</th></tr></thead><tbody>{m.points.map(p=><tr key={p.date}><td>{p.date}</td><td className="text-right">{formatMetric(p.current,spec.unit,m.currency,spec.precision)}</td><td className="text-right">{p.previousDate} · {formatMetric(p.previous,spec.unit,m.currency,spec.precision)}</td></tr>)}</tbody></table></div></details></>}
 </CardContent></Card>;
}
