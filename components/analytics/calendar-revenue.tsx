import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {formatMetric,shiftDay} from "@/lib/dashboard/metrics";
import {portfolioMetric} from "@/lib/dashboard/portfolio";
import {METRICS} from "@/lib/dashboard/read-model";
import type {AppData} from "@/lib/types";
export function CalendarRevenue({data}:{data:AppData}){
 const today=new Date().toISOString().slice(0,10),yesterday=shiftDay(today,-1),first=today.slice(0,7)+"-01",lastMonth=shiftDay(first,-1);
 const monthDays=Number(today.slice(8))-1;
 const windows=[{label:"Ieri",end:yesterday,days:1},...(monthDays>0?[{label:"Mese in corso",end:yesterday,days:monthDays}]:[]),{label:"Mese precedente",end:lastMonth,days:Number(lastMonth.slice(8))}];
 const sources=[METRICS.ads,METRICS.adsense].map(spec=>({spec,windows:windows.map(w=>({...w,total:portfolioMetric(data,spec,w.days,w.end)}))})).filter(s=>s.windows.some(w=>w.total.eligible));
 if(!sources.length)return null;
 return <Card className="gap-3 py-4"><CardHeader><CardTitle className="text-base">Ricavi pubblicitari · calendario</CardTitle><p className="text-xs text-muted-foreground">Fino a ieri (UTC) · solo periodi completi</p></CardHeader><CardContent className="space-y-3">{sources.map(s=><div key={s.spec.source}><p className="text-sm font-medium mb-2">{s.spec.label}</p><div className="grid gap-2 sm:grid-cols-3">{s.windows.map(w=><div key={w.label} className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">{w.label}</p>{w.total.groups.length?w.total.groups.map(g=><p key={g.currency} className="text-lg font-semibold tabular-nums">{formatMetric(g.value,"currency",g.currency)} {w.total.eligible>1&&<span className="text-xs text-muted-foreground font-normal">{g.count}/{w.total.eligible}</span>}</p>):<p className="text-lg text-muted-foreground">—</p>}<p className="text-xs text-muted-foreground">{w.total.range?.from} – {w.end}</p>{w.total.excluded.length>0&&<details className="text-xs text-muted-foreground"><summary>{w.total.excluded.length} esclusi</summary>{w.total.excluded.join(", ")}</details>}</div>)}</div></div>)}</CardContent></Card>;
}
