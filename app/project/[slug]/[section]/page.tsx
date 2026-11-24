import { notFound } from "next/navigation";
import { readDashboardData, type DashboardScope } from "@/lib/store";
import { getLatestGscIndexInspections } from "@/lib/insights";
import { aggregatePagesByUrl,aggregateQueriesByText } from "@/lib/report";
import { METRICS,projectMetric,sourceRows } from "@/lib/dashboard/read-model";
import { parseDays,dayRange,inRange,latestDay,type Range } from "@/lib/dashboard/metrics";
import { MetricCard,MetricSeries } from "@/components/analytics/metric-card";
import { Explorer,PeriodPicker,type Params,type Row } from "@/components/analytics/explorer";
import { SyncButton } from "@/components/sync-button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import {BarList} from "@/components/ui/bar-list";
import {RankExplorer,PerformanceExplorer,RevenueBreakdown} from "@/components/analytics/domain-charts";
import {landingGroups} from "@/lib/dashboard/domain";
import {interventionOutcome} from "@/lib/analytics/interventions";
import {SeoScatter} from "@/components/analytics/seo-scatter";
import type { MetricSpec } from "@/lib/dashboard/read-model";

const labels:Record<string,string>={acquisition:"Acquisizione",store:"Store",revenue:"Ricavi",health:"Salute",opportunities:"Opportunità",interventions:"Interventi",settings:"Integrazioni"};
export default async function Section({params,searchParams}:{params:Promise<{slug:string;section:string}>;searchParams:Promise<Params>}){
 const [{slug,section},query]=await Promise.all([params,searchParams]);if(!Object.hasOwn(labels,section))notFound();
 const data=await readDashboardData(section as DashboardScope,slug),p=data.projects.find(p=>p.slug===slug);if(!p||section==="store"&&p.type==="web")notFound();
 const days=parseDays(query.days),id=p.id;
 const byProject=<T extends {projectId?:string}>(rows:T[])=>rows.filter(r=>r.projectId===id);
 const windowFor=<T extends {date:string}>(rows:T[]):Range=>dayRange(latestDay(rows)??new Date().toISOString().slice(0,10),days);
 const within=<T extends {date:string}>(rows:T[],range=windowFor(rows))=>rows.filter(r=>inRange(r.date,range));
 const table=(title:string,columns:string[],rows:Row[],scope:string,note?:string)=><Explorer key={scope} title={title} columns={columns} rows={rows} scope={scope} params={query} note={note}/>;
 const annotations=byProject(data.projectInterventions??[]).map(r=>({date:r.date,title:r.title}));
 const charts=(specs:MetricSpec[])=>{const models=specs.map(spec=>projectMetric(data,id,spec,days));return <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{models.map(m=><MetricCard key={m.spec.source+m.spec.key} {...m}/>)}</div><div className="grid gap-4 xl:grid-cols-2">{models.map(m=><MetricSeries key={m.spec.source+m.spec.key} {...m} annotations={annotations}/>)}</div></>};
 let content:React.ReactNode;
 if(section==="acquisition"){
  const gsc=byProject(data.metricSnapshots).filter(r=>r.source==="gsc"),range=windowFor(gsc);
  const queries=aggregateQueriesByText(within(byProject(data.searchQueries),range)),pages=aggregatePagesByUrl(within(byProject(data.pageMetrics),range));
  const gscRows=(rows:ReturnType<typeof aggregateQueriesByText>)=>rows.map(r=>({id:r.key,cells:[r.key,r.clicks,r.impressions,r.impressions>0?r.ctr*100:null,r.impressions>0?r.avgPosition:null]}));
  const landing=within(byProject(data.ga4LandingMetrics??[]));
  const landingSummary=landingGroups(landing);
  const geo=byProject(data.seoGeoObservations??[]).sort((a,b)=>b.windowEnd.localeCompare(a.windowEnd));
  content=<>{p.type!=="app"&&<>{charts([METRICS.clicks,METRICS.impressions,METRICS.ctr,METRICS.position,METRICS.sessions,METRICS.visitors])}
  <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Query con più click</CardTitle></CardHeader><CardContent><BarList data={[...queries].sort((a,b)=>b.clicks-a.clicks).slice(0,10).map(r=>({name:r.key,value:r.clicks}))}/>{queries.length===0&&<p className="text-sm text-muted-foreground">Nessuna query disponibile.</p>}</CardContent></Card><SeoScatter data={queries.filter(r=>r.impressions>0&&r.avgPosition>0).slice(0,200).map(r=>({name:r.key,position:r.avgPosition,ctr:r.ctr*100,impressions:r.impressions}))}/></div>
  {table("Query Google",["Query","Click","Impression","CTR %","Posizione"],gscRows(queries),"queries","Estratto GSC, non inventario completo · "+range.from+" – "+range.to)}
  {table("Pagine Google",["URL","Click","Impression","CTR %","Posizione"],gscRows(pages),"pages","Stessa finestra dei totali GSC; righe legacy escluse.")}
  {table("Segmenti GSC",["Dimensione","Valore","Da","A","Click","Impression","CTR %","Posizione"],byProject(data.gscDimensionBreakdowns).sort((a,b)=>b.rangeEnd.localeCompare(a.rangeEnd)).map(r=>({id:r.id,cells:[r.dimension,r.key,r.rangeStart,r.rangeEnd,r.clicks,r.impressions,r.ctr*100,r.avgPosition]})),"segments","Finestre native del provider, anche sovrapposte: non sommare le righe.")}
  {table("Landing GA4 aggregate",["Host","Landing","Canale","Source / medium","Device","Fuso","Sessioni","Key events","Session key event rate %","Qualità"],landingSummary.map(r=>({id:r.key,cells:[r.host,r.landing,r.channel,r.sourceMedium,r.device,r.timeZone,r.sessions,r.keyEvents,r.rate,r.quality]})),"landing-summary","Raggruppamento per combinazione nativa; non sommare scope sovrapposti al totale progetto.")}
  {table("Landing GA4",["Data","Host","Landing","Canale","Dispositivo","Sessioni","Key events","Qualità"],landing.map(r=>({id:r.id,cells:[r.date,r.hostname,r.landingPage,r.channel,r.device,r.sessions,r.keyEvents,r.quality]})),"landing","Grana originale, filtrabile; non sommare utenti di fonti diverse.")}
  {table("Ricerca Bing, crawler AI e comportamento",["Fonte","Tipo","Scope","Da","A","Grana","Metriche numeriche"],geo.map(r=>({id:r.id,cells:[r.source,r.kind,r.scope,r.windowStart,r.windowEnd,r.grain,Object.entries(r.metrics).filter(([,v])=>typeof v==="number").map(([k,v])=>k+": "+v).join(" · ")]})),"geo","Finestre originali; crawler AI non equivale a citazioni o visite.")}</>}{p.type!=="web"&&charts([METRICS.downloads,METRICS.installs,METRICS.events,METRICS.uninstalls])}</>;
 }else if(section==="store"){
  const keywords=within(byProject(data.appKeywords)).sort((a,b)=>b.date.localeCompare(a.date)||b.opportunityScore-a.opportunityScore);
  const reviews=within(byProject(data.appReviews)).sort((a,b)=>b.date.localeCompare(a.date));
  const total=reviews.length;
  content=<>{charts([METRICS.downloads,METRICS.installs,METRICS.devices,METRICS.uninstalls])}
  <Card><CardHeader><CardTitle>Distribuzione recensioni importate</CardTitle></CardHeader><CardContent className="space-y-2">{[5,4,3,2,1].map(n=>{const count=reviews.filter(r=>r.rating===n).length;return <div key={n} className="flex items-center gap-3 text-sm"><span className="w-10">{n} ★</span><div className="h-2 flex-1 rounded bg-muted overflow-hidden"><div className="h-full rounded bg-primary" style={{width:total?count/total*100+"%":"0%"}}/></div><span className="w-12 text-right tabular-nums">{count}</span></div>})}<p className="text-xs text-muted-foreground">{total} recensioni importate; non è il rating globale dello store.</p></CardContent></Card>
  {table("Recensioni",["Data","Stelle","Lingua","Versione","Testo"],reviews.map(r=>({id:r.id,cells:[r.date,r.rating,r.language,r.appVersionName,r.text]})),"reviews")}
  {table("Keyword ASO",["Data","Keyword","Paese","Popolarità","Difficoltà","Score","Rank"],keywords.map(r=>({id:r.id,cells:[r.date,r.keyword,r.country,r.popularityScore,r.difficultyScore,r.opportunityScore,r.appRank]})),"keywords")}
  <RankExplorer rows={byProject(data.asoAppRankSnapshots)} days={days} params={query}/>{table("Storico ranking ASO",["Data","Keyword","Paese","Rank"],byProject(data.asoAppRankSnapshots).sort((a,b)=>b.date.localeCompare(a.date)).map(r=>({id:r.id,cells:[r.date,r.keyword,r.country,r.appRank]})),"ranks")}
  {table("Schede App Store",["Data","Locale","Tipo","Nome","Sottotitolo","Keyword","Descrizione"],byProject(data.ascMetadataSnapshots).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(r=>({id:r.id,cells:[r.createdAt,r.locale,r.kind,r.name,r.subtitle,r.keywords,r.description]})),"metadata")}
  {table("Esperimenti App Store",["Nome","Stato","Tipo","Data"],byProject(data.ascExperiments).map(r=>({id:r.id,cells:[r.name,r.state,r.elementType,r.createdAt]})),"experiments")}{table("Varianti esperimenti",["Esperimento","Variante","Stato","Data"],data.ascExperimentTreatments.map(r=>({id:r.id,cells:[data.ascExperiments.find(e=>e.id===r.experimentId)?.name??r.experimentId,r.name,r.state,r.createdAt]})),"treatments")}
  <p className="text-sm text-muted-foreground">Retention iOS: non disponibile finché il parser delle coorti non è validato.</p><a className="text-sm underline" href={"http://127.0.0.1:5177/?project="+encodeURIComponent(slug)} target="_blank" rel="noreferrer">Apri Store Studio</a></>;
 }else if(section==="revenue"){
  const mediation=within(byProject(data.admobMediationMetrics)).sort((a,b)=>b.date.localeCompare(a.date));
  content=<>{charts(p.type==="web"?[METRICS.adsense]:p.type==="app"?[METRICS.ads,METRICS.mrr,METRICS.subscribers,METRICS.rollingRevenue]:[METRICS.ads,METRICS.adsense,METRICS.mrr,METRICS.subscribers,METRICS.rollingRevenue])}
  {p.type!=="web"&&<RevenueBreakdown rows={mediation}/>} {p.type!=="web"&&table("Mediazione AdMob",["Data","Fonte","Formato","Valuta","Ricavi","Impression","Richieste","eCPM","Match rate"],mediation.map(r=>({id:r.id,cells:[r.date,r.adSourceName,r.format,r.currency,r.estimatedEarnings,r.impressions,r.adRequests,r.observedEcpm,r.matchRate]})),"mediation","Righe native. Nessuna somma fra valute diverse; mediazione prevale sul network nel totale.")}</>;
 }else if(section==="health"){
  const index=getLatestGscIndexInspections(data,{projectId:id});
  const perf=within(byProject(data.webPerformanceMetrics??[])).sort((a,b)=>b.date.localeCompare(a.date));
  const vitals=within(byProject(data.playVitalsMetrics)).sort((a,b)=>b.date.localeCompare(a.date));
  content=<>{p.type!=="app"&&<>{table("Indicizzazione Google",["URL","Esito","Priorità","Data"],index.sort((a,b)=>b.inspectedAt.localeCompare(a.inspectedAt)).map(r=>({id:r.id,cells:[r.url,r.issueCode,r.severity,r.inspectionDate]})),"index","Ultima ispezione per URL, non copertura dell'intero indice.")}
  {table("Sitemap",["Percorso","Ultimo invio","Warning","Errori"],byProject(data.gscSitemaps).map(r=>({id:r.id,cells:[r.path,r.lastSubmitted,r.warnings,r.errors]})),"sitemaps")}
  <PerformanceExplorer rows={perf} days={days} params={query}/>{table("Performance web",["Data","Fonte","URL","Scope","Device","LCP ms","INP ms","CLS","Stato"],perf.map(r=>({id:r.id,cells:[r.date,r.source,r.url,r.scope,r.device,r.lcpMs,r.inpMs,r.cls,r.status]})),"perf","Lab e field distinti; CrUX usa finestre rolling.")}</>}
  {p.type!=="web"&&charts([METRICS.crash,METRICS.anr])}{p.type!=="web"&&table("Android vitals",["Data","Crash rate (valore fonte)","ANR rate (valore fonte)"],vitals.map(r=>({id:r.id,cells:[r.date,r.crashRate,r.anrRate]})),"vitals","Non applicare soglie senza verificare definizione e unità del provider.")}</>;
 }else if(section==="opportunities"){
  content=table("Tutte le opportunità",["Titolo","Priorità","Score","Stato","Evidenza","Rilevata"],byProject(data.opportunities).sort((a,b)=>Number(b.status==="open")-Number(a.status==="open")||b.score-a.score).map(r=>({id:r.id,cells:[r.title,r.severity,r.score,r.status,r.description,r.detectedAt]})),"opportunities");
 }else if(section==="interventions"){
  const items=byProject(data.projectInterventions??[]).sort((a,b)=>b.date.localeCompare(a.date));
  const selected=items.find(r=>r.id===query.intervention)??items[0];
  let evidence:ReturnType<typeof interventionOutcome>|null=null;
  if(selected)try{evidence=interventionOutcome(data,selected,Math.min(days,90));}catch{evidence=null;}
  content=<>{items.length>0&&<Card><CardHeader><CardTitle>Confronto prima / dopo</CardTitle></CardHeader><CardContent className="space-y-3"><form method="get" className="flex flex-wrap gap-2"><input type="hidden" name="days" value={Math.min(days,90)}/><select name="intervention" defaultValue={selected?.id} aria-label="Intervento" className="border rounded-md bg-card p-2 text-sm max-w-full">{items.map(r=><option key={r.id} value={r.id}>{r.date} · {r.title}</option>)}</select><button className="border rounded px-3 text-sm">Confronta</button></form>{evidence?<><p className="text-sm">{evidence.days} giorni per finestra, giorno intervento escluso.</p><p className="text-xs text-muted-foreground">{evidence.concurrentInterventions.length} interventi concomitanti. Variazioni descrittive, non causali.</p></>:<p className="text-sm text-muted-foreground">Confronto non disponibile per questo intervento.</p>}</CardContent></Card>}{evidence&&table("Copertura prima/dopo",["Fonte","Finestra","Da","A","Giorni osservati","Attesi","Completa"],evidence.observations.map(o=>({id:o.source+o.window,cells:[o.source,o.window,o.start,o.end,o.daysWithRows,o.daysExpected,o.complete?"Sì":"No"]})),"intervention-coverage")}{evidence&&table("Variazioni confrontabili",["Fonte","Metrica","Prima","Dopo","Delta","Variazione %","Qualità"],evidence.changes.flatMap(c=>c.metrics?Object.entries(c.metrics).map(([key,v])=>({id:c.source+key,cells:[c.source,key,v.before,v.after,v.delta,v.relativeChange===null?null:v.relativeChange*100,c.status]})):[{id:c.source,cells:[c.source,"Copertura insufficiente",null,null,null,null,c.status]}]),"intervention-changes","I valori di tasso sono nella scala nativa del provider; qualità limitata e copertura restano esplicite.")}{table("Registro interventi",["Data","Titolo","Tipo","Target","Note"],byProject(data.projectInterventions??[]).sort((a,b)=>b.date.localeCompare(a.date)).map(r=>({id:r.id,cells:[r.date,r.title,r.kind,r.targetUrl,r.notes]})),"interventions","Registro osservazionale: non dimostra causalità.")}<p className="text-sm">Per i confronti prima/dopo: <code className="break-all">npx tsx scripts/growth-evidence-report.ts --slug {slug}</code></p></>;
 }else{
  const rows=sourceRows(data,p);
  content=<><Card><CardHeader><CardTitle>Fonti mappate</CardTitle></CardHeader><CardContent className="divide-y">{rows.map(s=><div key={s.source} className="flex flex-wrap justify-between gap-3 py-3"><div><p className="text-sm font-medium">{s.label}</p><p className="text-xs text-muted-foreground">Ultimo dato: {s.latest??"—"} · ultimo sync: {s.run??"—"} · {s.status}{s.stale?" · dato in ritardo":""}</p></div><SyncButton projectSlug={slug} source={s.source}/></div>)}{!rows.length&&<p className="text-sm text-muted-foreground">Nessuna integrazione mappata.</p>}</CardContent></Card>
  {table("Cronologia operazioni",["Fonte","Inizio","Fine","Stato"],byProject(data.connectorRuns).sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt)).map(r=>({id:r.id,cells:[r.source,r.startedAt,r.finishedAt,r.status]})),"runs")}</>;
 }
 return <div className="space-y-4"><div className="flex items-center flex-wrap gap-3 justify-between"><h2 className="text-lg font-semibold">{labels[section]}</h2>{["acquisition","store","revenue","health","interventions"].includes(section)&&<PeriodPicker params={query}/>}</div>{content}</div>;
}
