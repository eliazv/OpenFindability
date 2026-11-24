"use client";
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMetric, type MetricResult } from "@/lib/dashboard/metrics";
import type { MetricSpec } from "@/lib/dashboard/read-model";
import { useId } from "react";

const config={current:{label:"Corrente",color:"var(--chart-1)"},previous:{label:"Precedente",color:"var(--muted-foreground)"}} satisfies ChartConfig;
type Props={spec:MetricSpec;result:MetricResult;latest?:string};
export function MetricCard({spec,result:m,latest}:Props){
 const id=useId();
 return <Card className="min-w-0 gap-1 py-4"><CardHeader className="px-4 pb-0"><CardTitle className="text-sm font-medium text-muted-foreground">{spec.label}</CardTitle></CardHeader><CardContent className="px-4">
 <div className="text-2xl font-semibold tabular-nums">{formatMetric(m.value,spec.unit,m.currency)}</div>
 <div className="flex items-center justify-between gap-2"><span className="text-xs tabular-nums">{m.deltaPercent===null?"Confronto non disponibile":(m.deltaPercent>0?"+":"")+formatMetric(m.deltaPercent,"percent")}</span>
 <ChartContainer config={config} className="h-10 w-24 aspect-auto" aria-hidden="true"><AreaChart data={m.points}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={.2}/><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0}/></linearGradient></defs><Area dataKey="current" type="linear" stroke="var(--chart-1)" fill={`url(#${id})`} connectNulls={false} isAnimationActive={false}/></AreaChart></ChartContainer></div>
 <p className="text-xs text-muted-foreground">{spec.source} · {m.range.from} – {m.range.to}</p><p className="text-xs text-muted-foreground">{m.observed}/{m.expected} giorni osservati{latest?" · ultimo "+latest:" · nessun dato"}</p>{m.warning&&<p className="text-xs text-warning">{m.warning}</p>}
 </CardContent></Card>;
}
export function MetricSeries({spec,result:m}:Props){
 const format=(v:number)=>formatMetric(v,spec.unit,m.currency);
 return <Card className="min-w-0"><CardHeader><CardTitle className="text-base">{spec.label}</CardTitle><p className="text-xs text-muted-foreground">{spec.source} · {m.range.from} – {m.range.to} · {m.currency??spec.unit}</p></CardHeader><CardContent>
 {m.observed===0?<p className="py-12 text-center text-sm text-muted-foreground">{m.warning??"Nessuna misura disponibile."}</p>:<>
 <ChartContainer config={config} className="h-[280px] w-full aspect-auto"><LineChart data={m.points} accessibilityLayer><CartesianGrid vertical={false}/><XAxis dataKey="date" tickFormatter={(v:string)=>v.slice(5)} minTickGap={25}/><YAxis width={75} tickFormatter={format}/><ChartTooltip content={<ChartTooltipContent formatter={(v,name,item)=> <span className="tabular-nums">{name==="previous"?"Precedente "+item.payload.previousDate:"Corrente"}: {typeof v==="number"?format(v):"—"}</span>}/>}/><Line dataKey="current" type="linear" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false}/><Line dataKey="previous" type="linear" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} connectNulls={false} isAnimationActive={false}/></LineChart></ChartContainer>
 <p className="text-xs text-muted-foreground">Linea continua: corrente · tratteggiata: precedente ({m.previousRange.from} – {m.previousRange.to}). Giorni mancanti non interpolati.</p>
 <details className="mt-3 text-sm"><summary className="cursor-pointer">Dati del grafico</summary><div className="max-h-64 overflow-auto"><table className="w-full text-xs tabular-nums"><thead><tr><th className="text-left">Data</th><th className="text-right">Corrente</th><th className="text-right">Precedente</th></tr></thead><tbody>{m.points.map(p=><tr key={p.date}><td>{p.date}</td><td className="text-right">{formatMetric(p.current,spec.unit,m.currency)}</td><td className="text-right">{p.previousDate} · {formatMetric(p.previous,spec.unit,m.currency)}</td></tr>)}</tbody></table></div></details></>}
 </CardContent></Card>;
}
