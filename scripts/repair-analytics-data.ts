import "dotenv/config";
import { db, getSqliteHandle } from "@/lib/db/client";
import { readData, updateData } from "@/lib/store";
import { reconcileGscProjectLinks } from "@/lib/gsc-project-links";

async function main() {
  const apply = process.argv.includes("--apply");
  const sqlite = getSqliteHandle(db);
  const links = reconcileGscProjectLinks(await readData());
  const valid = "source='ga4' AND json_valid(raw_json)";
  const eligible = (name: string, json: string) => `${valid} AND ${name} IS NULL AND json_type(raw_json,'$.${json}') IN ('integer','real') AND json_extract(raw_json,'$.${json}')>=0 AND json_extract(raw_json,'$.${json}')=cast(json_extract(raw_json,'$.${json}') AS INTEGER)`;
  const sessions = eligible("sessions", "sessions"), events = eligible("key_events", "keyEvents");
  const count = (where: string) => (sqlite.prepare(`SELECT count(*) n FROM metric_snapshots WHERE ${where}`).get() as { n: number }).n;
  const changes = { apply, ...links, ga4Sessions: count(sessions), ga4KeyEvents: count(events), invalidProjectTypes: (sqlite.prepare("SELECT count(*) n FROM projects WHERE type='ecommerce'").get() as { n: number }).n };
  if (apply) {
    await updateData(data => { reconcileGscProjectLinks(data); });
    sqlite.transaction(() => {
      sqlite.exec(`UPDATE metric_snapshots SET sessions=json_extract(raw_json,'$.sessions') WHERE ${sessions};
        UPDATE metric_snapshots SET key_events=json_extract(raw_json,'$.keyEvents') WHERE ${events};
        UPDATE projects SET type='web',category=COALESCE(NULLIF(category,''),'ecommerce') WHERE type='ecommerce';
        UPDATE _openfindability_store_revision SET revision=revision+1 WHERE id=1;`);
    })();
  }
  console.log(JSON.stringify(changes));
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
