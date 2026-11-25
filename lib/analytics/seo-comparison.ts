import {getSqliteHandle,type AppDb} from "@/lib/db/client";
import {dayRange,shiftDay,validDay} from "@/lib/dashboard/metrics";
const grain="json_extract(raw_json,'$._openfindability.grain')='day' AND json_extract(raw_json,'$._openfindability.version')=2";
export function seoChanges(database:AppDb,id:string,end:string,days:number,kind:"page"|"query"="page",limit=20,comparison:"previous"|"year"="previous"){
 if(!validDay(end)||!Number.isSafeInteger(days)||days<1||days>365)throw new Error("Invalid period");
 const current=dayRange(end,days),previous=dayRange(shiftDay(end,comparison==="year"?-364:-days),days);
 const n=getSqliteHandle(database),table=kind==="page"?"page_metrics":"search_queries",key=kind==="page"?"page":"query";
 const coverage=(range:typeof current)=>(n.prepare("SELECT count(DISTINCT date) n FROM metric_snapshots WHERE project_id=? AND source='gsc' AND date BETWEEN ? AND ?").get(id,range.from,range.to) as {n:number}).n;
 const complete=coverage(current)===days&&coverage(previous)===days;
 const rows=n.prepare(`WITH a AS (SELECT ${key} key,sum(clicks) clicks,sum(impressions) impressions,sum(avg_position*impressions)*1.0/nullif(sum(impressions),0) position FROM ${table} WHERE project_id=? AND date BETWEEN ? AND ? AND ${grain} GROUP BY ${key}), b AS (SELECT ${key} key,sum(clicks) clicks,sum(impressions) impressions,sum(avg_position*impressions)*1.0/nullif(sum(impressions),0) position FROM ${table} WHERE project_id=? AND date BETWEEN ? AND ? AND ${grain} GROUP BY ${key}) SELECT a.key,a.clicks current,b.clicks previous,a.clicks-b.clicks delta,a.impressions currentImpressions,b.impressions previousImpressions,a.position currentPosition,b.position previousPosition FROM a INNER JOIN b ON a.key=b.key WHERE a.impressions+b.impressions>=100 ORDER BY abs(a.clicks-b.clicks) DESC,a.key LIMIT ?`).all(id,current.from,current.to,id,previous.from,previous.to,Math.min(200,Math.max(1,limit))) as {key:string;current:number;previous:number;delta:number;currentImpressions:number;previousImpressions:number;currentPosition:number|null;previousPosition:number|null}[];
 return {kind,current,previous,complete,rows:rows.map(r=>({...r,percent:r.previous>0?100*r.delta/r.previous:null})),note:"Solo entità presenti in entrambe le finestre: estratti GSC, assenza di una riga non equivale a zero. Confronto annuale a 52 settimane."};
}
export function seoEntity(database:AppDb,id:string,key:string,kind:"page"|"query",end:string,days:number){
 if(!validDay(end)||days<1||days>365||key.length>2048)throw new Error("Invalid entity");
 const range=dayRange(end,days),n=getSqliteHandle(database),table=kind==="page"?"page_metrics":"search_queries";
 const trend=n.prepare(`SELECT date,sum(clicks) clicks,sum(impressions) impressions,sum(clicks)*1.0/nullif(sum(impressions),0) ctr,sum(avg_position*impressions)*1.0/nullif(sum(impressions),0) position FROM ${table} WHERE project_id=? AND ${kind}=? AND date BETWEEN ? AND ? AND ${grain} GROUP BY date ORDER BY date`).all(id,key,range.from,range.to);
 const other=kind==="page"?"query":"page";
 const related=n.prepare(`SELECT ${other} key,sum(clicks) clicks,sum(impressions) impressions,sum(clicks)*1.0/nullif(sum(impressions),0) ctr,sum(avg_position*impressions)*1.0/nullif(sum(impressions),0) position FROM search_queries WHERE project_id=? AND ${kind}=? AND date BETWEEN ? AND ? AND ${grain} GROUP BY ${other} ORDER BY clicks DESC LIMIT 100`).all(id,key,range.from,range.to);
 return {kind,key,range,trend,related};
}

/** First path component from absolute URLs. Query strings are not a content group. */
export function seoGroups(database:AppDb,id:string,end:string,days:number){
 const range=dayRange(end,days),n=getSqliteHandle(database);
 const groups=n.prepare(`WITH paths AS (SELECT page,clicks,impressions,avg_position,CASE WHEN instr(substr(page,instr(page,'://')+3),'/')>0 THEN substr(substr(page,instr(page,'://')+3),instr(substr(page,instr(page,'://')+3),'/')) ELSE '/' END path FROM page_metrics WHERE project_id=? AND date BETWEEN ? AND ? AND ${grain}), groups AS (SELECT *,substr(path,1,CASE WHEN instr(substr(path,2),'/')>0 THEN instr(substr(path,2),'/')+1 WHEN instr(path,'?')>0 THEN instr(path,'?')-1 ELSE length(path) END) prefix FROM paths) SELECT prefix,count(DISTINCT page) pages,sum(clicks) clicks,sum(impressions) impressions,sum(clicks)*100.0/nullif(sum(impressions),0) ctr,sum(avg_position*impressions)*1.0/nullif(sum(impressions),0) position FROM groups GROUP BY prefix ORDER BY clicks DESC LIMIT 100`).all(id,range.from,range.to) as {prefix:string;pages:number;clicks:number;impressions:number;ctr:number|null;position:number|null}[];
 const distribution=n.prepare(`WITH q AS (SELECT query,sum(avg_position*impressions)*1.0/nullif(sum(impressions),0) position FROM search_queries WHERE project_id=? AND date BETWEEN ? AND ? AND ${grain} GROUP BY query), bins AS (SELECT CASE WHEN position<=3 THEN 'Top 3' WHEN position<=10 THEN '4–10' WHEN position<=20 THEN '11–20' ELSE '21+' END bucket FROM q WHERE position>0) SELECT bucket,count(*) count FROM bins GROUP BY bucket`).all(id,range.from,range.to) as {bucket:string;count:number}[];
 return {range,groups,distribution};
}
