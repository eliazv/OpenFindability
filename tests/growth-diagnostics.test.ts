import test from "node:test";
import assert from "node:assert/strict";
import {brandTerms,seoDiagnostics,conversionSignals} from "../lib/analytics/growth-diagnostics";
test("brand matches complete normalized terms, not substrings; CTR compares peers without self",()=>{
 const rows=[{query:"Vita Romagna eventi",clicks:10,impressions:100,position:4},{query:"vitalità",clicks:1,impressions:100,position:4},...Array.from({length:10},(_,i)=>({query:"eventi "+i,clicks:50,impressions:500,position:4})),{query:"eventi oggi",clicks:1,impressions:1000,position:4}];
 const out=seoDiagnostics(rows,brandTerms("Vita Romagna"));
 assert.equal(out.segments.find(s=>s.segment==="Brand")?.queries,1);
 assert.equal(out.opportunities[0].query,"eventi oggi");
 assert.ok(out.opportunities[0].benchmark>9);
 assert.ok(out.clusters.some(r=>r.token==="eventi"));
});
test("conversion peers require the same observed dates",()=>{
 const rows=Array.from({length:7},(_,i)=>({id:String(i),projectId:"p",date:"2026-11-0"+(i+1),hostname:"example.com",landingPage:"/a",channel:"Organic Search",sourceMedium:"google / organic",device:"mobile",timeZone:"Europe/Rome",sessions:20,engagedSessions:10,keyEvents:0,sessionKeyEventRate:0,quality:"standard" as const,fetchedAt:"2026-11-10"}));
 assert.deepEqual(conversionSignals(rows),[]);
});
