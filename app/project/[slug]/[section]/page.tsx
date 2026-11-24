import { notFound } from "next/navigation";
import { readDashboardData, type DashboardScope } from "@/lib/store";
import { getLatestGscIndexInspections } from "@/lib/insights";
import { aggregatePagesByUrl,aggregateQueriesByText } from "@/lib/report";
import { METRICS,projectMetric,sourceRows,availableMetrics,needsAttention,syncStatus } from "@/lib/dashboard/read-model";
import { parseDays,dayRange,inRange,latestDay,type Range } from "@/lib/dashboard/metrics";
import {CalendarRevenue} from "@/components/analytics/calendar-revenue";
import {MetricPanel} from "@/components/analytics/metric-panel";
import {Disclosure} from "@/components/analytics/disclosure";
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
 const table=(title:string,columns:string[],rows:Row[],scope:string,note?:string,visibleColumns?:number[],defaultSort?:string)=><Explorer key={scope} title={title} columns={columns} rows={rows} scope={scope} params={query} note={note} visibleColumns={visibleColumns} defaultSort={defaultSort}/>;
 const advanced=(title:string,count:number,child:React.ReactNode,scope:string)=>count>0?<Disclosure title={title} count={count} open={Object.keys(query).some(k=>k.startsWith(scope+"_")||(scope==="experiments"&&k.startsWith("treatments_")))}>{child}</Disclosure>:null;
 const annotations=byProject(data.projectInterventions??[]).map(r=>({date:r.date,title:r.title}));
 const charts=(specs:MetricSpec[],scope="metric")=><MetricPanel models={availableMetrics(data,p,specs).map(spec=>projectMetric(data,id,spec,days))} params={query} scope={scope} annotations={annotations}/>;
 let content:React.ReactNode;
 if(section==="acquisition"){
  const gsc=byProject(data.metricSnapshots).filter(r=>r.source==="gsc"),range=windowFor(gsc);
  const queries=aggregateQueriesByText(within(byProject(data.searchQueries),range)),pages=aggregatePagesByUrl(within(byProject(data.pageMetrics),range));
  const queryConfigured=!!p.gscProperty||byProject(data.searchQueries).length>0||byProject(data.pageMetrics).length>0;
  const gscRows=(rows:ReturnType<typeof aggregateQueriesByText>)=>rows.map(r=>({id:r.key,cells:[r.key,r.clicks,r.impressions,r.impressions>0?r.ctr*100:null,r.impressions>0?r.avgPosition:null]}));
  const landing=within(byProject(data.ga4LandingMetrics??[]));
  const landingSummary=landingGroups(landing);
  const geo=byProject(data.seoGeoObservations??[]).sort((a,b)=>b.windowEnd.localeCompare(a.windowEnd));
  const webMetrics=[METRICS.clicks,METRICS.visitors,METRICS.sessions,METRICS.impressions,METRICS.ctr,METRICS.position,METRICS.gaUsers,METRICS.gaViews,METRICS.umamiViews,METRICS.gaEvents];
  const appMetrics=[METRICS.downloads,METRICS.installs,METRICS.deviceInstalls,METRICS.uninstalls,METRICS.events,METRICS.deviceUninstalls,METRICS.uninstallEvents,METRICS.devices];
  content=<>{charts(p.type==="web"?webMetrics:p.type==="app"?[...appMetrics,...webMetrics]:[METRICS.clicks,...appMetrics,...webMetrics.filter(m=>m!==METRICS.clicks)])}{p.type!=="app"||queryConfigured||landing.length>0||geo.length>0?<>
  {queries.length>0&&<div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Query con più click</CardTitle></CardHeader><CardContent><BarList data={[...queries].sort((a,b)=>b.clicks-a.clicks).slice(0,10).map(r=>({name:r.key,value:r.clicks}))}/></CardContent></Card><SeoScatter data={queries.filter(r=>r.impressions>0&&r.avgPosition>0).slice(0,200).map(r=>({name:r.key,position:r.avgPosition,ctr:r.ctr*100,impressions:r.impressions}))}/></div>}
  {queryConfigured&&table("Query Google",["Query","Click","Impression","CTR %","Posizione"],gscRows(queries),"queries",range.from+" – "+range.to+" · estratto GSC",undefined,"1:desc")}
  {queryConfigured&&table("Pagine Google",["URL","Click","Impression","CTR %","Posizione"],gscRows(pages),"pages","Estratto GSC",undefined,"1:desc")}
  {advanced("Segmenti GSC",byProject(data.gscDimensionBreakdowns).length,table("Segmenti GSC",["Dimensione","Valore","Da","A","Click","Impression","CTR %","Posizione"],byProject(data.gscDimensionBreakdowns).sort((a,b)=>b.rangeEnd.localeCompare(a.rangeEnd)).map(r=>({id:r.id,cells:[r.dimension,r.key,r.rangeStart,r.rangeEnd,r.clicks,r.impressions,r.ctr*100,r.avgPosition]})),"segments","Finestre sovrapposte: non sommare.",[0,1,3,4,5,6,7]),"segments")}
  {landingSummary.length>0&&table("Landing e conversioni",["Host","Landing","Canale","Source / medium","Device","Fuso","Sessioni","Key events","Session key event rate %","Qualità"],landingSummary.map(r=>({id:r.key,cells:[r.host,r.landing,r.channel,r.sourceMedium,r.device,r.timeZone,r.sessions,r.keyEvents,r.rate,r.quality]})),"landing-summary","Combinazioni GA4; possibili sovrapposizioni tra host.",[1,2,6,7,8])}
  {advanced("Dati giornalieri GA4",landing.length,table("Landing GA4",["Data","Host","Landing","Canale","Dispositivo","Sessioni","Eventi chiave","Qualità","Source / medium","Fuso","Sessioni con coinvolgimento","Tasso sessioni con evento chiave (%)"],landing.map(r=>({id:r.id,cells:[r.date,r.hostname,r.landingPage,r.channel,r.device,r.sessions,r.keyEvents,r.quality,r.sourceMedium,r.timeZone,r.engagedSessions,r.sessionKeyEventRate*100]})),"landing",undefined,[0,2,3,5,6,7]),"landing")}
  {advanced("Bing, crawler AI e Clarity",geo.length,table("Bing, crawler AI e Clarity",["Fonte","Tipo","Scope","Da","A","Grana","Metriche","Copertura"],geo.map(r=>({id:r.id,cells:[r.source,r.kind,r.scope,r.windowStart,r.windowEnd,r.grain,Object.entries(r.metrics).map(([k,v])=>k+": "+(typeof v==="object"?JSON.stringify(v):String(v))).join(" · "),JSON.stringify(r.coverage)]})),"geo","Crawler AI ≠ citazioni o visite.",[0,1,2,4,6]),"geo")}</>:null}</>;
 }else if(section==="store"){
  const allKeywords=byProject(data.appKeywords).sort((a,b)=>b.date.localeCompare(a.date)||b.opportunityScore-a.opportunityScore);
  const keywords=[...new Map([...allKeywords].reverse().map(r=>[JSON.stringify([r.keyword,r.country]),r])).values()].sort((a,b)=>b.opportunityScore-a.opportunityScore);
  const reviews=within(byProject(data.appReviews)).sort((a,b)=>b.date.localeCompare(a.date));
  const total=reviews.length;
  const tracked=new Set((p.asoKeywords??[]).map(k=>k.toLocaleLowerCase("it")));
  const pairs=new Set(allKeywords.map(r=>JSON.stringify([r.keyword,r.country])));
  const keywordHistory=data.asoKeywordSnapshots.filter(r=>pairs.has(JSON.stringify([r.keyword,r.country]))||(tracked.has(r.keyword.toLocaleLowerCase("it"))&&(!p.asoCountries?.length||p.asoCountries.includes(r.country)))).sort((a,b)=>b.date.localeCompare(a.date));
  content=<>{charts([METRICS.downloads,METRICS.installs,METRICS.deviceInstalls,METRICS.rating,METRICS.reviewCount,METRICS.devices,METRICS.uninstalls,METRICS.events,METRICS.deviceUninstalls,METRICS.uninstallEvents])}
  {total>0&&<Card className="gap-3 py-4"><CardHeader><CardTitle>Recensioni importate</CardTitle></CardHeader><CardContent className="space-y-2">{[5,4,3,2,1].map(n=>{const count=reviews.filter(r=>r.rating===n).length;return <div key={n} className="flex items-center gap-3 text-sm"><span className="w-10">{n} ★</span><div className="h-2 flex-1 rounded bg-muted overflow-hidden"><div className="h-full rounded bg-primary" style={{width:total?count/total*100+"%":"0%"}}/></div><span className="w-12 text-right tabular-nums">{count}</span></div>})}<p className="text-xs text-muted-foreground">{total} recensioni · non è il rating globale.</p></CardContent></Card>}
  {total>0&&table("Recensioni",["Data","Stelle","Lingua","Versione","Testo","Mi piace"],reviews.map(r=>({id:r.id,cells:[r.date,r.rating,r.language,r.appVersionName,r.text,r.thumbsUp]})),"reviews",undefined,[0,1,4])}
  {keywords.length>0&&table("Keyword ASO",["Data","Keyword","Paese","Popolarità","Difficoltà","Score","Rank"],keywords.map(r=>({id:r.id,cells:[r.date,r.keyword,r.country,r.popularityScore,r.difficultyScore,r.opportunityScore,r.appRank]})),"keywords","Ultima rilevazione per keyword e paese.",[1,2,6,3,4,5])}
  {byProject(data.asoAppRankSnapshots).length>0&&<RankExplorer rows={byProject(data.asoAppRankSnapshots)} days={days} params={query}/>} {advanced("Storico ranking ASO",byProject(data.asoAppRankSnapshots).length,table("Storico ranking ASO",["Data","Keyword","Paese","Rank"],byProject(data.asoAppRankSnapshots).sort((a,b)=>b.date.localeCompare(a.date)).map(r=>({id:r.id,cells:[r.date,r.keyword,r.country,r.appRank]})),"ranks"),"ranks")}
  {advanced("Storico ricerca keyword",keywordHistory.length,table("Ricerca keyword",["Data","Keyword","Paese","Popolarità","Difficoltà","Score","Competitor","Classificazione"],keywordHistory.map(r=>({id:r.id,cells:[r.date,r.keyword,r.country,r.popularityScore,r.difficultyScore,r.opportunityScore,r.competitorCount,r.classification]})),"keyword-history",undefined,[0,1,2,3,4,5]),"keyword-history")}
  {advanced("Schede App Store",byProject(data.ascMetadataSnapshots).length,table("Schede App Store",["Data","Locale","Tipo","Nome","Sottotitolo","Keyword","Descrizione","Testo promozionale","Novità","Stato versione"],byProject(data.ascMetadataSnapshots).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(r=>({id:r.id,cells:[r.createdAt,r.locale,r.kind,r.name,r.subtitle,r.keywords,r.description,r.promotionalText,r.whatsNew,r.versionState]})),"metadata",undefined,[0,1,2,3,4]),"metadata")}
  {advanced("Esperimenti App Store",byProject(data.ascExperiments).length,<>{table("Esperimenti App Store",["Nome","Stato","Tipo","Data"],byProject(data.ascExperiments).map(r=>({id:r.id,cells:[r.name,r.state,r.elementType,r.createdAt]})),"experiments")}{table("Varianti esperimenti",["Esperimento","Variante","Stato","Data"],data.ascExperimentTreatments.map(r=>({id:r.id,cells:[data.ascExperiments.find(e=>e.id===r.experimentId)?.name??r.experimentId,r.name,r.state,r.createdAt]})),"treatments")}</>,"experiments")}
  {p.appStoreTrackId&&<p className="text-xs text-muted-foreground">Retention iOS non disponibile.</p>}</>;
 }else if(section==="revenue"){
  const mediation=within(byProject(data.admobMediationMetrics)).sort((a,b)=>b.date.localeCompare(a.date));
  content=<>{charts([METRICS.ads,METRICS.adsense,METRICS.mrr,METRICS.rollingRevenue,METRICS.subscribers,METRICS.trials,METRICS.customers])}
  <CalendarRevenue data={data}/>
  {mediation.length>0&&<RevenueBreakdown rows={mediation}/>} {advanced("Dettaglio mediazione AdMob",mediation.length,table("Mediazione AdMob",["Data","Fonte","Formato","Valuta","Ricavi","Impression","Richieste","eCPM","Match rate","Richieste abbinate","Click"],mediation.map(r=>({id:r.id,cells:[r.date,r.adSourceName,r.format,r.currency,r.estimatedEarnings,r.impressions,r.adRequests,r.observedEcpm,r.matchRate,r.matchedRequests,r.clicks]})),"mediation","Mediazione inclusa nel totale AdMob.",[0,1,2,3,4,5,7]),"mediation")}</>;
 }else if(section==="health"){
  const index=getLatestGscIndexInspections(data,{projectId:id});
  const problems=index.filter(r=>r.severity!=="none");
  const severity=(s:string)=>s==="high"?3:s==="medium"?2:s==="low"?1:0;
  const allPerf=byProject(data.webPerformanceMetrics??[]);
  const perf=within(allPerf).sort((a,b)=>b.date.localeCompare(a.date));
  const vitals=within(byProject(data.playVitalsMetrics)).sort((a,b)=>b.date.localeCompare(a.date));
  content=<>{availableMetrics(data,p,[METRICS.crash,METRICS.anr]).length>0&&charts([METRICS.crash,METRICS.anr])}{(p.type!=="app"||index.length>0||perf.length>0)&&<>{index.length>0&&<div className="grid grid-cols-3 gap-3">{[["URL ispezionati",index.length],["Indicizzati",index.filter(r=>r.issueCode==="indexed").length],["Problemi",problems.length]].map(([label,value])=><Card key={label} className="gap-1 py-4"><CardHeader><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold tabular-nums">{value}</CardContent></Card>)}</div>}{index.length>0&&table("Problemi di indicizzazione",["URL","Esito","Priorità","Data","Stato GSC","Canonical Google"],problems.sort((a,b)=>severity(b.severity)-severity(a.severity)||b.inspectedAt.localeCompare(a.inspectedAt)).map(r=>({id:r.id,cells:[r.url,r.issueCode,r.severity,r.inspectionDate,r.coverageState,r.googleCanonical]})),"index","Solo URL ispezionati.",[0,1,2,3])}{advanced("Tutte le ispezioni",index.length,table("Ispezioni Google",["URL","Esito","Priorità","Data","Stato GSC","Canonical Google"],index.sort((a,b)=>b.inspectedAt.localeCompare(a.inspectedAt)).map(r=>({id:r.id,cells:[r.url,r.issueCode,r.severity,r.inspectionDate,r.coverageState,r.googleCanonical]})),"all-index",undefined,[0,1,2,3]),"all-index")}
  {advanced("Sitemap",byProject(data.gscSitemaps).length,table("Sitemap",["Percorso","Ultimo invio","Warning","Errori"],byProject(data.gscSitemaps).map(r=>({id:r.id,cells:[r.path,r.lastSubmitted,r.warnings,r.errors]})),"sitemaps"),"sitemaps")}
  {allPerf.length>0&&<PerformanceExplorer rows={allPerf} days={days} params={query}/>} {advanced("Misure performance",perf.length,table("Performance web",["Data","Fonte","URL","Scope","Device","LCP ms","INP ms","CLS","Stato","FCP ms","TBT ms","Score Lighthouse"],perf.map(r=>({id:r.id,cells:[r.date,r.source,r.url,r.scope,r.device,r.lcpMs,r.inpMs,r.cls,r.status,r.fcpMs,r.tbtMs,r.performanceScore===null?null:r.performanceScore*100]})),"perf","Lab e field separati.",[0,1,2,4,5,6,7,8]),"perf")}</>}
  {advanced("Misure Android vitals",vitals.length,table("Android vitals",["Data","Crash rate (valore fonte)","ANR rate (valore fonte)"],vitals.map(r=>({id:r.id,cells:[r.date,r.crashRate,r.anrRate]})),"vitals",undefined),"vitals")}{!index.length&&!allPerf.length&&!vitals.length&&<p className="text-sm text-muted-foreground">Nessuna misura di salute disponibile.</p>}</>;
 }else if(section==="opportunities"){
  content=table("Tutte le opportunità",["Titolo","Priorità","Score","Stato","Evidenza","Rilevata"],byProject(data.opportunities).sort((a,b)=>Number(b.status==="open")-Number(a.status==="open")||b.score-a.score).map(r=>({id:r.id,cells:[r.title,r.severity==="high"?"Alta":r.severity==="medium"?"Media":"Bassa",r.score,r.status==="open"?"Aperta":r.status==="done"?"Completata":r.status==="ignored"?"Ignorata":r.status,r.description,r.detectedAt]})),"opportunities",undefined,[0,1,2,3]);
 }else if(section==="interventions"){
  const items=byProject(data.projectInterventions??[]).sort((a,b)=>b.date.localeCompare(a.date));
  const selected=items.find(r=>r.id===query.intervention)??items[0];
  let evidence:ReturnType<typeof interventionOutcome>|null=null;
  if(selected)try{evidence=interventionOutcome(data,selected,Math.min(days,90));}catch{evidence=null;}
  content=<>{items.length>0&&<Card><CardHeader><CardTitle>Confronto prima / dopo</CardTitle></CardHeader><CardContent className="space-y-3"><form method="get" className="flex flex-wrap gap-2"><input type="hidden" name="days" value={Math.min(days,90)}/><select name="intervention" defaultValue={selected?.id} aria-label="Intervento" className="border rounded-md bg-card p-2 text-sm max-w-full">{items.map(r=><option key={r.id} value={r.id}>{r.date} · {r.title}</option>)}</select><button className="border rounded px-3 text-sm">Confronta</button></form>{evidence?<><p className="text-sm">{evidence.days} giorni per finestra, giorno intervento escluso.</p><p className="text-xs text-muted-foreground">{evidence.concurrentInterventions.length} interventi concomitanti. Variazioni descrittive, non causali.</p></>:<p className="text-sm text-muted-foreground">Confronto non disponibile per questo intervento.</p>}</CardContent></Card>}{evidence&&advanced("Copertura prima/dopo",evidence.observations.length,table("Copertura prima/dopo",["Fonte","Finestra","Da","A","Giorni osservati","Attesi","Completa"],evidence.observations.map(o=>({id:o.source+o.window,cells:[o.source,o.window,o.start,o.end,o.daysWithRows,o.daysExpected,o.complete?"Sì":"No"]})),"intervention-coverage"),"intervention-coverage")}{evidence&&table("Variazioni confrontabili",["Fonte","Metrica","Prima","Dopo","Delta","Variazione %","Qualità"],evidence.changes.flatMap(c=>c.metrics?Object.entries(c.metrics).map(([key,v])=>({id:c.source+key,cells:[c.source,key,v.before,v.after,v.delta,v.relativeChange===null?null:v.relativeChange*100,c.status]})):[{id:c.source,cells:[c.source,"Copertura insufficiente",null,null,null,null,c.status]}]),"intervention-changes","Tassi nella scala del provider.")}{table("Registro interventi",["Data","Titolo","Tipo","Target","Note","Riferimento"],byProject(data.projectInterventions??[]).sort((a,b)=>b.date.localeCompare(a.date)).map(r=>({id:r.id,cells:[r.date,r.title,r.kind,r.targetUrl,r.notes,r.reference]})),"interventions",undefined,[0,1,2,3])}</>;
 }else{
  const rows=sourceRows(data,p).sort((a,b)=>Number(needsAttention(b))-Number(needsAttention(a)));
  content=<><Card><CardHeader><CardTitle>Fonti mappate</CardTitle></CardHeader><CardContent className="divide-y">{rows.map(s=><div key={s.source} className="flex flex-wrap justify-between gap-3 py-3"><div><p className="text-sm font-medium">{s.label}</p><p className="text-xs text-muted-foreground">Ultimo dato: {s.latest??"—"} · ultimo sync: {s.run??"—"} · {syncStatus(s.status)}{s.stale?" · dato in ritardo":""}</p></div>{s.manualAudit?<span className="text-xs text-muted-foreground self-center">Audit manuale</span>:<SyncButton projectSlug={slug} source={s.source}/>}</div>)}{!rows.length&&<p className="text-sm text-muted-foreground">Nessuna integrazione mappata.</p>}</CardContent></Card>
  {table("Cronologia operazioni",["Fonte","Inizio","Fine","Stato"],byProject(data.connectorRuns).sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt)).map(r=>({id:r.id,cells:[r.source,r.startedAt,r.finishedAt,syncStatus(r.status)]})),"runs")}</>;
 }
 return <div className="space-y-4"><div className="flex items-center flex-wrap gap-3 justify-between"><h2 className="text-lg font-semibold">{labels[section]}</h2>{["acquisition","store","revenue","health","interventions"].includes(section)&&<PeriodPicker params={query} options={section==="interventions"?[7,28,90]:undefined}/>}</div>{content}</div>;
}
