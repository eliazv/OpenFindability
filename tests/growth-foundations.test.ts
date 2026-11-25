import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {createDb,getSqliteHandle} from "../lib/db/client";
import {readDataWith,writeDataWith} from "../lib/store";
import {acquireSync,commitSync,putMetricSnapshots,syncProgress} from "../lib/sync-store";
import {seoChanges,seoGroups} from "../lib/analytics/seo-comparison";
import {dailyCoverage} from "../lib/analytics/data-quality";
import {readPreferences,savePreferences} from "../lib/dashboard/preferences";
import {measure,dayRange} from "../lib/dashboard/metrics";

test("isolated sync transactions, lock, coverage and preferences",()=>{
 const db=createDb(":memory:",path.join(process.cwd(),"drizzle"));
 try{
  const data=readDataWith(db);
  const p={id:"p",slug:"p",name:"P",type:"web" as const,gscProperty:"sc-domain:example.com",createdAt:"2026-11-01",updatedAt:"2026-11-01"};
  data.projects.push(p);writeDataWith(db,data);
  const lock=acquireSync(db,2);
  try{assert.throws(()=>acquireSync(db,1),/già in corso/);lock.progress("p","gsc",1);assert.equal(syncProgress(db)?.completed,1);}finally{lock.release();}
  assert.equal(syncProgress(db),null);
  const run={id:"run-1",projectId:"p",source:"gsc" as const,status:"success" as const,startedAt:"2026-11-25",finishedAt:"2026-11-25"};
  const row={id:"m1",projectId:"p",source:"gsc" as const,date:"2026-11-20",clicks:10,createdAt:"2026-11-25"};
  commitSync(db,run,()=>putMetricSnapshots(db,[row]));
  assert.throws(()=>commitSync(db,{...run,id:"run-2"},()=>{putMetricSnapshots(db,[{...row,clicks:99}]);throw new Error("rollback");}),/rollback/);
  assert.equal(readDataWith(db).metricSnapshots[0].clicks,10);
  assert.equal(readDataWith(db).connectorRuns.length,1);
  assert.deepEqual(dailyCoverage(db,p,"gsc",7,"2026-11-25")?.missing,["2026-11-21","2026-11-22","2026-11-23"]);
  savePreferences(db,"p",{favorite:true,archived:false,primaryMetrics:["gsc:clicks"],goalMetric:"gsc:clicks",goalTarget:100});
  assert.equal(readPreferences(db,"p")[0].goalTarget,100);
  assert.throws(()=>savePreferences(db,"p",{favorite:false,archived:false,primaryMetrics:["not-a-metric"]}),/Invalid/);
 }finally{getSqliteHandle(db).close();}
});

test("SEO comparison excludes legacy and absent entities; URL grouping is weighted",()=>{
 const db=createDb(":memory:",path.join(process.cwd(),"drizzle"));
 try{
  const data=readDataWith(db);
  data.projects.push({id:"p",slug:"p",name:"P",type:"web",createdAt:"2026-11-01",updatedAt:"2026-11-01"});
  const meta={_openfindability:{grain:"day",version:2}};
  for(const [date,clicks] of [["2026-11-01",10],["2026-11-02",20]] as const){
   data.metricSnapshots.push({id:date,projectId:"p",source:"gsc",date,clicks,createdAt:date});
   data.pageMetrics.push({id:"a"+date,projectId:"p",date,page:"https://example.com/blog/a",clicks,impressions:100,ctr:clicks/100,avgPosition:3,rawJson:meta});
  }
  data.pageMetrics.push({id:"b",projectId:"p",date:"2026-11-02",page:"https://example.com/blog/b",clicks:90,impressions:100,ctr:.9,avgPosition:2,rawJson:meta});
  data.pageMetrics.push({id:"legacy",projectId:"p",date:"2026-11-02",page:"https://example.com/legacy",clicks:999,impressions:1000,ctr:.999,avgPosition:1});
  writeDataWith(db,data);
  const changes=seoChanges(db,"p","2026-11-02",1);
  assert.equal(changes.complete,true);assert.equal(changes.rows.length,1);assert.equal(changes.rows[0].delta,10);
  const groups=seoGroups(db,"p","2026-11-02",2).groups;
  assert.equal(groups.length,1);assert.equal(groups[0].clicks,120);assert.ok(Math.abs(groups[0].position!-8/3)<1e-9);
 }finally{getSqliteHandle(db).close();}
});

test("different comparison currency does not hide valid current revenue",()=>{
 const m=measure([{date:"2026-11-01",value:10,currency:"USD"},{date:"2026-11-02",value:20,currency:"EUR"}],dayRange("2026-11-02",1),"sum",true);
 assert.equal(m.value,20);assert.equal(m.currency,"EUR");assert.equal(m.delta,null);
});
