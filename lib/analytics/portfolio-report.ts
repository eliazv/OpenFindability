import type {AppData} from "@/lib/types";
import {formatMetric,validDay} from "@/lib/dashboard/metrics";
import {projectAnalytics,portfolioAnalytics} from "./growth-intelligence";
import {runDetails} from "@/lib/dashboard/run-display";
const cell=(v:unknown)=>String(v??"—").replace(/[\r\n]/g," ").replace(/\|/g,"\\|").replace(/</g,"&lt;");
export function buildPortfolioReport(data:AppData,days=28){
 const result=portfolioAnalytics(data,days),lines=["# OpenFindability — report portafoglio","","Generato: "+new Date().toISOString().slice(0,10)+" · "+days+" giorni per fonte.","","## Totali","","| Metrica | Valore | Copertura | Al |","| --- | ---: | ---: | --- |"];
 for(const t of result.totals)for(const g of t.groups)lines.push("| "+[t.label,formatMetric(g.value,t.unit,g.currency),g.count+"/"+t.eligible,t.range?.to].map(cell).join(" | ")+" |");
 lines.push("","## Variazioni rilevanti","","| Progetto | Metrica | Periodo | Variazione |","| --- | --- | --- | ---: |");
 for(const s of result.signals.slice(0,20))lines.push("| "+[s.project,s.metric,s.range.from+" – "+s.range.to,s.percent.toFixed(1)+"%"].map(cell).join(" | ")+" |");
 for(const p of data.projects){const a=projectAnalytics(data,p,days);lines.push("","## "+cell(p.name),"","| Metrica | Valore | Giorni osservati | Al |","| --- | ---: | ---: | --- |");
 for(const m of a.metrics){const r=m.result;if(r.value===null)continue;lines.push("| "+[m.spec.label,formatMetric(r.value,m.spec.unit,r.currency,m.spec.precision),r.observed+"/"+r.expected,r.range.to].map(cell).join(" | ")+" |");}
 if(a.opportunities.length){lines.push("","Opportunità aperte:");for(const o of a.opportunities.slice(0,5))lines.push("- "+cell(o.title)+" ("+o.severity+")");}
 const latest=new Map<string,AppData["connectorRuns"][number]>();for(const r of data.connectorRuns.filter(r=>r.projectId===p.id).sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt)))if(!latest.has(r.source))latest.set(r.source,r);
 const issues=[...latest.values()].filter(r=>r.status!=="success");if(issues.length){lines.push("","Ultime operazioni da verificare:");for(const r of issues)lines.push("- "+cell(r.source)+": "+cell(r.status)+" · "+cell(runDetails(r).message));}
 }
 lines.push("","Valute separate; finestre ancorate alla disponibilità di ogni fonte. Le variazioni non dimostrano causalità. I dati mancanti non sono zero.","");
 return lines.join("\n");
}
