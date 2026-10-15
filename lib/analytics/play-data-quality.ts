import type Database from "better-sqlite3";
import { readPlayInstallMetrics } from "@/lib/connectors/play-gcs-stats";

const fields={user_installs:"userInstalls",user_uninstalls:"userUninstalls",install_events:"installEvents",uninstall_events:"uninstallEvents"} as const;
export function recoverPlayMetrics(sqlite:Database.Database,apply=false) {
  const counts={rows:0,user_installs:0,user_uninstalls:0,install_events:0,uninstall_events:0};
  const update=sqlite.prepare(`UPDATE play_install_stats SET ${Object.keys(fields).map(key=>`${key}=coalesce(${key},?)`).join(",")} WHERE id=?`);
  sqlite.transaction(()=>{
    const rows=sqlite.prepare("SELECT id,raw_json,user_installs,user_uninstalls,install_events,uninstall_events FROM play_install_stats WHERE json_valid(raw_json)").all() as {id:string;raw_json:string;user_installs:number|null;user_uninstalls:number|null;install_events:number|null;uninstall_events:number|null}[];
    for(const row of rows) {
      const raw:unknown=JSON.parse(row.raw_json);
      if(!raw||typeof raw!=="object"||Array.isArray(raw))continue;
      const strings=Object.fromEntries(Object.entries(raw).filter((entry):entry is [string,string]=>typeof entry[1]==="string"));
      const metrics=readPlayInstallMetrics(strings);
      let changed=false;
      for(const [column,field] of Object.entries(fields))if(row[column as keyof typeof fields]===null && metrics[field]!==undefined){counts[column as keyof typeof fields]++;changed=true;}
      if(!changed)continue;
      counts.rows++;
      if(apply)update.run(...Object.values(fields).map(field=>metrics[field]??null),row.id);
    }
    if(apply&&counts.rows)sqlite.prepare("UPDATE _openfindability_store_revision SET revision=revision+1 WHERE id=1").run();
  })();
  return {apply,...counts};
}
