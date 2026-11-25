import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {createDb,getSqliteHandle} from "../lib/db/client";
import {readDashboardDataWith,readDataWith,readGscDetailAggregatesWith,writeDataWith} from "../lib/store";
test("dashboard scopes isolate projects, exclude unrelated GSC details and cannot be written",()=>{
 const db=createDb(":memory:",path.join(process.cwd(),"drizzle"));
 try{
  const data=readDataWith(db);
  for(const id of ["one","two"]){data.projects.push({id,slug:id,name:id,type:"web",createdAt:"2026-11-01",updatedAt:"2026-11-01"});data.metricSnapshots.push({id:"m-"+id,projectId:id,source:"gsc",date:"2026-11-01",clicks:2,createdAt:"2026-11-01"});data.searchQueries.push({id:"q-"+id,projectId:id,date:"2026-11-01",query:id,clicks:2,impressions:20,ctr:.1,avgPosition:4,rawJson:{_openfindability:{grain:"day",version:2}}});}
  data.searchQueries.push({id:"q-legacy",projectId:"one",date:"2026-11-01",query:"legacy",clicks:9,impressions:90,ctr:.1,avgPosition:2});
  writeDataWith(db,data);
  const overview=readDashboardDataWith(db,"overview","one");assert.equal(overview.projects.length,1);assert.equal(overview.metricSnapshots.length,1);assert.equal(overview.searchQueries.length,0);assert.throws(()=>writeDataWith(db,overview),/Untracked/);
  assert.equal(readDashboardDataWith(db,"acquisition","one").searchQueries.length,0);
  const gsc=readGscDetailAggregatesWith(db,"one","2026-11-01","2026-11-01");assert.deepEqual(gsc.queries,[{key:"one",clicks:2,impressions:20,ctr:.1,avgPosition:4}]);assert.equal(gsc.hasRows,true);assert.equal(readGscDetailAggregatesWith(db,"three","2026-11-01","2026-11-01").hasRows,false);assert.equal(readDashboardDataWith(db,"acquisition","unknown").metricSnapshots.length,0);
 }finally{getSqliteHandle(db).close();}
});
