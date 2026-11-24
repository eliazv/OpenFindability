import {readProjects} from "@/lib/store";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import Link from "next/link";
const tools=[
 {title:"Report SEO e ASO",text:"Report locali, opportunità e keyword.",command:"npx tsx scripts/report.ts <slug> all"},
 {title:"Interventi e crescita",text:"Registro e confronto prima/dopo.",command:"npx tsx scripts/growth-evidence-report.ts --slug <slug>"},
 {title:"Audit indicizzazione",text:"Controllo manuale con budget provider.",command:"pnpm run audit:index"},
 {title:"Performance web",text:"Anteprima audit; --apply per eseguire.",command:"pnpm run audit:performance"},
 {title:"Release Android / iOS",text:"Preflight e status. Nessuna pubblicazione automatica.",command:"pnpm run release:status"},
 {title:"Export",text:"Google Sheets e warehouse. Anteprima senza --apply.",command:"pnpm run sheet:export"},
];
export default async function Tools(){
 const projects=await readProjects();
 return <main className="p-4 lg:p-7 space-y-5 w-full min-w-0"><header><h1 className="text-2xl font-semibold">Strumenti</h1><p className="text-sm text-muted-foreground">Analisi e operazioni locali. I comandi non vengono eseguiti dalla pagina.</p></header><Card><CardHeader><CardTitle>Store Studio</CardTitle></CardHeader><CardContent className="space-y-3"><a className="text-sm underline" href="http://127.0.0.1:5177/" target="_blank" rel="noreferrer">Apri Studio</a><div className="flex flex-wrap gap-2">{projects.filter(p=>p.type!=="web").map(p=><a key={p.id} href={"http://127.0.0.1:5177/?project="+encodeURIComponent(p.slug)} target="_blank" rel="noreferrer" className="text-sm border rounded-md px-3 py-2">{p.name}</a>)}</div><p className="text-xs text-muted-foreground">Studio si avvia con la dashboard oppure con pnpm studio. Per collegare un repository usare npx tsx scripts/update-project.ts --slug &lt;slug&gt; --flutter-path &lt;repository&gt;.</p></CardContent></Card>
 <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{tools.map(t=><Card key={t.title}><CardHeader><CardTitle>{t.title}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{t.text}</p><code className="block break-all rounded bg-muted p-2 text-xs">{t.command}</code></CardContent></Card>)}</div><Link href="/data" className="text-sm underline">Centro dati e Doctor</Link></main>;
}
