import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {MetricSeries} from "./metric-card";
import {BarList} from "@/components/ui/bar-list";
import {observationModel,adBreakdown} from "@/lib/dashboard/domain";
import {type Params} from "./explorer";
import type {AppData} from "@/lib/types";

function Choice({params,name,choices,value,label}:{params:Params;name:string;choices:{key:string;label:string}[];value:string;label:string}){
 return <form method="get" className="flex flex-wrap gap-2">{Object.entries(params).filter(([k,v])=>k!==name&&typeof v==="string").map(([k,v])=><input key={k} type="hidden" name={k} value={v as string}/>)}<select name={name} defaultValue={value} aria-label={label} className="rounded border bg-card text-sm max-w-full px-3 py-2">{choices.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select><button className="border rounded px-3 py-2 text-sm">Applica</button></form>;
}
export function RankExplorer({rows,days,params}:{rows:AppData["asoAppRankSnapshots"];days:number;params:Params}){
 const choices=[...new Map(rows.map(r=>[JSON.stringify([r.keyword,r.country]),{key:JSON.stringify([r.keyword,r.country]),label:r.keyword+" · "+r.country}])).values()].sort((a,b)=>a.label.localeCompare(b.label));
 const chosen=choices.find(c=>c.key===params.rank)??choices[0];
 if(!chosen)return <p className="text-sm text-muted-foreground">Storico rank ASO non disponibile.</p>;
 const series=rows.filter(r=>JSON.stringify([r.keyword,r.country])===chosen.key);
 const dedup=new Map<string,typeof series[number]>();for(const r of series)if(!dedup.has(r.date)||dedup.get(r.date)!.observedAt<r.observedAt)dedup.set(r.date,r);
 return <div className="space-y-2"><Choice params={params} name="rank" choices={choices} value={chosen.key} label="Keyword e paese"/><MetricSeries {...observationModel({source:"aso",key:"appRank",label:"Rank · "+chosen.label,unit:"count",kind:"snapshot",lowerBetter:true},[...dedup.values()].map(r=>({date:r.date,value:r.appRank})),days)}/><p className="text-xs text-muted-foreground">Posizione 1 in alto; dati mancanti non interpolati.</p></div>;
}
export function PerformanceExplorer({rows,days,params}:{rows:NonNullable<AppData["webPerformanceMetrics"]>;days:number;params:Params}){
 const key=(r:typeof rows[number])=>JSON.stringify([r.source,r.url,r.scope,r.device]);
 const choices=[...new Map(rows.map(r=>[key(r),{key:key(r),label:r.source+" · "+r.device+" · "+r.scope+" · "+r.url}])).values()].sort((a,b)=>a.label.localeCompare(b.label));
 const selected=choices.find(c=>c.key===params.performance)??choices[0];if(!selected)return <p className="text-sm text-muted-foreground">Nessuna misura performance.</p>;
 const matching=rows.filter(r=>key(r)===selected.key),source=matching[0].source;
 const specs=([{key:"lcpMs",label:"LCP (ms)",precision:0},{key:"inpMs",label:"INP (ms)",precision:0},{key:"cls",label:"CLS",precision:3},{key:"performanceScore",label:"Score Lighthouse (0–1)",precision:2},{key:"fcpMs",label:"FCP (ms)",precision:0},{key:"tbtMs",label:"TBT (ms)",precision:0}] as const).filter(s=>matching.some(r=>r.status==="available"&&r[s.key]!==null));
 return <div className="space-y-3"><Choice params={params} name="performance" choices={choices} value={selected.key} label="Fonte, URL e dispositivo"/><div className="grid gap-3 xl:grid-cols-3">{specs.map(s=><MetricSeries key={s.key} {...observationModel({source,key:s.key,label:s.label,unit:"decimal",kind:"snapshot",precision:s.precision,lowerBetter:s.key!=="performanceScore"},matching.map(r=>({date:r.date,value:r.status==="available"?r[s.key]:null})),days)}/>)}</div><p className="text-xs text-muted-foreground">{source==="crux"?"CrUX field p75: finestre rolling, non misure giornaliere indipendenti.":"Lighthouse lab: snapshot di test sintetici, non misure field."}</p></div>;
}
export function RevenueBreakdown({rows}:{rows:AppData["admobMediationMetrics"]}){
 const model=adBreakdown(rows);return <Card><CardHeader><CardTitle>Ricavi per fonte pubblicitaria</CardTitle><p className="text-xs text-muted-foreground">Mediazione AdMob · valute separate{model.excluded>0?" · "+model.excluded+" righe escluse":""}.</p></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2">{model.groups.map(g=><div key={g.currency}><h3 className="text-sm font-medium mb-2">{g.currency}</h3><BarList data={g.rows} currency={g.currency}/></div>)}{!model.groups.length&&<p className="text-sm text-muted-foreground">Nessun breakdown disponibile.</p>}</CardContent></Card>;
}
