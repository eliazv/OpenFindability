import assert from "node:assert/strict";
import test from "node:test";
import { createDb, getSqliteHandle } from "../lib/db/client";
import { readDataWith, writeDataWith } from "../lib/store";
import { normalizeLandingRows, syncGa4LandingProject, LANDING_DIMENSIONS, LANDING_METRICS } from "../lib/connectors/ga4-landing";
import { normalizeCrux, normalizePageSpeed, fetchPerformance, performanceSample, publicPageUrl } from "../lib/connectors/web-performance";
import { makeIntervention, interventionOutcome } from "../lib/analytics/interventions";
import { growthEvidenceSnapshot } from "../lib/analytics/growth-evidence";
import { warehouseColumns } from "../lib/integrations/motherduck";
import { readGrowthEvidenceWith, saveIntervention } from "../lib/analytics/growth-evidence-store";
import { performanceApiKey } from "../lib/connectors/google-performance-config";

const project={id:"p",slug:"site",name:"Site",type:"web" as const,websiteUrl:"https://example.org",ga4PropertyId:"123",createdAt:"2026-01-01",updatedAt:"2026-01-01"};
const row=(landing="/",date="20261010",sessions="10",events="3",rate="0.2")=>({dimensionValues:[date,"example.org",landing,"Organic Search","google / organic","mobile"].map(value=>({value})),metricValues:[sessions,"1",events,rate].map(value=>({value}))});
const now="2026-10-15T12:00:00Z";
const psi={lighthouseResult:{finalUrl:"https://example.org/",lighthouseVersion:"13",categories:{performance:{score:0.9}},audits:{"largest-contentful-paint":{numericValue:1800},"cumulative-layout-shift":{numericValue:0.02},"total-blocking-time":{numericValue:40}}}};
const crux={record:{key:{url:"https://example.org/",formFactor:"PHONE"},collectionPeriod:{firstDate:{year:2026,month:9,day:16},lastDate:{year:2026,month:10,day:13}},metrics:{largest_contentful_paint:{percentiles:{p75:2300}},cumulative_layout_shift:{percentiles:{p75:"0.03"}}}}};

test("shared performance key is a fallback; dedicated keys retain precedence",()=>{
  const names=["CRUX_API_KEY","PAGESPEED_API_KEY","GOOGLE_CLOUD_API_KEY_GOD"] as const;
  const previous=names.map(name=>process.env[name]);
  try{
    delete process.env.CRUX_API_KEY;process.env.PAGESPEED_API_KEY=" ";process.env.GOOGLE_CLOUD_API_KEY_GOD=" shared-test-value ";
    assert.equal(performanceApiKey("crux"),"shared-test-value");assert.equal(performanceApiKey("pagespeed"),"shared-test-value");
    process.env.CRUX_API_KEY="dedicated-test-value";assert.equal(performanceApiKey("crux"),"dedicated-test-value");
    delete process.env.GOOGLE_CLOUD_API_KEY_GOD;assert.equal(performanceApiKey("pagespeed"),undefined);
  }finally{names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];});}
});

test("landing metrics preserve the provider rate, fractional key events and quality metadata",()=>{
  const rows=normalizeLandingRows("p",{rows:[row("/","20261010","10","3.5","0.2")],metadata:{timeZone:"Europe/Rome",subjectToThresholding:true}},now);
  assert.equal(rows[0].keyEvents,3.5);assert.equal(rows[0].sessionKeyEventRate,0.2);assert.equal(rows[0].quality,"thresholded");
  assert.equal(rows[0].id,normalizeLandingRows("p",{rows:[row()]},now)[0].id);
  assert.throws(()=>normalizeLandingRows("p",{rows:[row("/","20260230")]},now),/date/);
  assert.throws(()=>normalizeLandingRows("p",{rows:[row("/","20261010","10","3","20")]},now),/metric/);
});

test("GA4 checks requested field compatibility by API name and paginates completely",async()=>{
  const requests:{url:string;body:Record<string,unknown>}[]=[];
  const request:typeof fetch=async(input,init)=>{
    const url=String(input),body=JSON.parse(String(init?.body));requests.push({url,body});
    if(url.endsWith(":checkCompatibility"))return Response.json({dimensionCompatibilities:[...LANDING_DIMENSIONS,"unrelated"].map(apiName=>({dimensionMetadata:{apiName},compatibility:"COMPATIBLE"})),metricCompatibilities:LANDING_METRICS.map(apiName=>({metricMetadata:{apiName},compatibility:"COMPATIBLE"}))});
    return Response.json({rowCount:10001,rows:body.offset===0?Array.from({length:10000},(_,i)=>row(`/page-${i}`)):[row("/last")],metadata:{timeZone:"Europe/Rome"}});
  };
  const result=await syncGa4LandingProject(project,"2026-10-01","2026-10-13",request,async()=>"test-token");
  assert.equal(result.rows.length,10001);assert.equal(result.replace,true);assert.equal(result.result.status,"success");
  assert.equal(requests[2].body.offset,10000);assert.deepEqual(requests[0].body.dimensionFilter,requests[1].body.dimensionFilter);
  const incomplete:typeof fetch=async(input,init)=>String(input).endsWith(":checkCompatibility")?request(input,init):Response.json({rowCount:1,rows:[]});
  await assert.rejects(syncGa4LandingProject(project,"2026-10-01","2026-10-13",incomplete,async()=>"test-token"),/incomplete/);
});

test("lab and field measurements preserve units, scope, missing INP and zero CLS",()=>{
  const lab=normalizePageSpeed("p","https://example.org/","mobile",psi,now);
  assert.equal(lab.performanceScore,0.9);assert.equal(lab.inpMs,null);assert.equal(lab.tbtMs,40);assert.equal(lab.periodStart,null);
  const field=normalizeCrux("p","https://example.org/","url","mobile",crux,now);
  assert.equal(field.cls,0.03);assert.equal(field.inpMs,null);assert.equal(field.periodStart,"2026-09-16");
  assert.equal(normalizeCrux("p","https://example.org/","url","mobile",{record:{...crux.record,metrics:{cumulative_layout_shift:{percentiles:{p75:"0"}}}}},now).cls,0);
  assert.throws(()=>normalizeCrux("p","https://example.org","origin","mobile",crux,now),/scope/);
  assert.throws(()=>normalizePageSpeed("p","https://example.org/","mobile",{lighthouseResult:{...psi.lighthouseResult,runtimeError:{code:"FAILED"}}},now),/runtime/);
});

test("CrUX NOT_FOUND is explicit no_data; quota failures do not manufacture measurements or leak keys",async()=>{
  const previous=process.env.CRUX_API_KEY;process.env.CRUX_API_KEY="fake-test-key";
  try {
    const missing=await fetchPerformance("p","crux","https://example.org/","url","mobile",async()=>Response.json({error:{status:"NOT_FOUND"}},{status:404}));
    assert.equal(missing.status,"no_data");assert.equal(missing.lcpMs,null);
    await assert.rejects(fetchPerformance("p","crux","https://example.org/","url","mobile",async()=>new Response("",{status:429})),/HTTP 429/);
    await assert.rejects(fetchPerformance("p","crux","https://example.org/","url","mobile",async()=>{throw new Error("fake-test-key");}),error=>error instanceof Error && !error.message.includes("fake-test-key"));
  }finally{if(previous===undefined)delete process.env.CRUX_API_KEY;else process.env.CRUX_API_KEY=previous;}
});

test("performance samples are bounded, same-origin and omit query strings",()=>{
  assert.deepEqual(performanceSample("https://example.org",[{page:"https://other.org/",impressions:99},{page:"https://example.org/a?secret=1",impressions:20},{page:"https://example.org/a",impressions:10}],3),["https://example.org/","https://example.org/a"]);
  assert.throws(()=>publicPageUrl("http://127.0.0.1"),/public/);
  assert.throws(()=>publicPageUrl("https://user:pass@example.org"),/public/);
});

test("new FK children survive project edits; before/after excludes intervention day and refuses incomplete comparisons",()=>{
  const database=createDb(":memory:","drizzle");
  try {
    const data=readDataWith(database);data.projects.push(project);
    const item=makeIntervention(project,{date:"2026-10-10",title:"Improve title",kind:"title",url:"https://example.org/",notes:"private",reference:"private-reference"});
    data.projectInterventions=[item];data.webPerformanceMetrics=[normalizePageSpeed("p","https://example.org/","mobile",psi,now)];
    data.ga4LandingMetrics=normalizeLandingRows("p",{rows:[row("/","20261009","10","3","0.2"),row("/","20261010","999","999","1"),row("/","20261011","20","2","0.1")]},now);
    writeDataWith(database,data);
    const changed=readDataWith(database);changed.projects[0].name="Updated";writeDataWith(database,changed);
    const reloaded=readDataWith(database);assert.equal(reloaded.ga4LandingMetrics?.length,3);assert.equal(reloaded.projectInterventions?.[0].notes,"private");assert.equal(reloaded.webPerformanceMetrics?.length,1);
    const outcome=interventionOutcome(reloaded,item,1,"2026-10-14");
    const ga=outcome.changes.find(r=>r.source==="ga4_landing")!;
    assert.equal(ga.status,"comparable");assert.equal(ga.metrics?.sessions.before,10);assert.equal(ga.metrics?.sessions.after,20);
    assert.equal(ga.metrics?.sessionKeyEventRate.before,0.2);
    assert.equal(interventionOutcome(reloaded,item,2,"2026-10-14").changes.find(r=>r.source==="ga4_landing")?.status,"insufficient_coverage");
    assert.equal(interventionOutcome(reloaded,item,1,"2026-10-11").observations.find(r=>r.source==="ga4_landing" && r.window==="after")?.values,null);
    const snapshot=growthEvidenceSnapshot(reloaded,"site","2026-10-09","2026-10-09");
    assert.equal(snapshot.landings[0].sessionKeyEventRate,0.2);assert.ok(!JSON.stringify(snapshot).includes("private-reference"));
    assert.deepEqual(warehouseColumns("project_interventions",["id","notes","reference","title"].map(name=>({name,type:"TEXT"}))).map(c=>c.name),["id","title"]);
    assert.equal(readGrowthEvidenceWith(database,"site","2026-10-09","2026-10-11").ga4LandingMetrics.length,3);
    const beforeEdit=readDataWith(database);
    const edited=makeIntervention(project,{id:item.id,date:item.date,title:"Revised title",kind:"title"},item);
    saveIntervention(database,edited,item.updatedAt);
    assert.throws(()=>writeDataWith(database,Object.assign(beforeEdit,{opportunities:[]})),/revision/);
    assert.throws(()=>saveIntervention(database,edited,"old-version"),/changed/);
    assert.equal(readGrowthEvidenceWith(database,"site","2026-10-09","2026-10-11").projectInterventions[0].title,"Revised title");
  }finally{getSqliteHandle(database).close();}
});
