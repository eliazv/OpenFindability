import assert from "node:assert/strict";
import test from "node:test";
import { createDb,getSqliteHandle } from "../lib/db/client";
import { readPlayInstallMetrics } from "../lib/connectors/play-gcs-stats";
import { recoverPlayMetrics } from "../lib/analytics/play-data-quality";

test("Play device/user/event counts remain distinct; missing fields are not zero",()=>{
  assert.deepEqual(readPlayInstallMetrics({"Daily Device Installs":"0","Daily Device Uninstalls":"0","Daily User Installs":"3","Daily User Uninstalls":"2","Install events":"4","Uninstall events":"5"}),{installs:0,uninstalls:0,activeDeviceInstalls:undefined,userInstalls:3,userUninstalls:2,installEvents:4,uninstallEvents:5});
  assert.equal(readPlayInstallMetrics({"Uninstall events":""}).uninstallEvents,undefined);
  assert.equal(readPlayInstallMetrics({"Daily User Uninstalls":"-1"}).userUninstalls,undefined);
});

test("Play recovery is preview-first, idempotent and preserves existing values, raw JSON and device zeros",()=>{
  const app=createDb(":memory:","drizzle"),sqlite=getSqliteHandle(app);
  try{
    sqlite.exec("INSERT INTO projects(id,name,slug,type,created_at,updated_at) VALUES ('p','Site','site','app','2026-01-01','2026-01-01')");
    const raw=JSON.stringify({"Daily Device Uninstalls":"0","Daily User Installs":"3","Daily User Uninstalls":"2","Install events":"4","Uninstall events":"5"});
    sqlite.prepare("INSERT INTO play_install_stats(id,project_id,date,uninstalls,user_installs,raw_json,created_at) VALUES ('r','p','2026-10-01',0,99,?,'2026-10-15')").run(raw);
    assert.equal(recoverPlayMetrics(sqlite).rows,1);
    assert.equal((sqlite.prepare("SELECT user_uninstalls FROM play_install_stats").get() as {user_uninstalls:number|null}).user_uninstalls,null);
    assert.equal(recoverPlayMetrics(sqlite,true).rows,1);assert.equal(recoverPlayMetrics(sqlite,true).rows,0);
    const result=sqlite.prepare("SELECT uninstalls,user_installs,user_uninstalls,uninstall_events,raw_json FROM play_install_stats").get();
    assert.deepEqual(result,{uninstalls:0,user_installs:99,user_uninstalls:2,uninstall_events:5,raw_json:raw});
  }finally{sqlite.close();}
});
