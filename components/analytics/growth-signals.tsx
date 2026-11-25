import Link from "next/link";
import {ArrowDownRight,ArrowUpRight} from "lucide-react";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {SourceIcon} from "./source-icon";
import type {growthSignals} from "@/lib/analytics/growth-intelligence";
export function GrowthSignals({signals,days=28}:{signals:ReturnType<typeof growthSignals>;days?:number}){
 if(!signals.length)return null;
 return <Card className="gap-2 py-3"><CardHeader><CardTitle className="text-base">Variazioni rilevanti</CardTitle></CardHeader><CardContent className="divide-y">{signals.slice(0,8).map(s=><Link key={s.id} href={"/project/"+s.slug+"/"+(["admob","adsense","revenuecat"].includes(s.source)?"revenue":["play_stats","asc_analytics","play_console"].includes(s.source)?"store":"acquisition")+"?"+new URLSearchParams({from:s.range.from,to:s.range.to,compare:s.comparison,metric:s.source+":"+s.key}).toString()} prefetch={false} className="flex items-center gap-3 py-2 hover:bg-muted/50"><SourceIcon source={s.source}/><div className="min-w-0 flex-1"><p className="text-sm truncate">{s.project} · {s.metric}</p><p className="text-xs text-muted-foreground">{s.range.from} – {s.range.to}</p></div><span className="text-sm tabular-nums">{s.label}</span><span className={"inline-flex items-center gap-1 text-xs font-medium tabular-nums "+(s.improved?"text-green-600":"text-destructive")}>{s.percent>0?<ArrowUpRight className="size-4"/>:<ArrowDownRight className="size-4"/>}{s.percent.toFixed(1)}%</span></Link>)}</CardContent></Card>;
}
