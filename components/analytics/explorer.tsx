import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from "@/components/ui/table";
export type Params=Record<string,string|string[]|undefined>;
export type Cell=string|number|null|undefined;
export type Row={id:string;cells:Cell[]};
export function queryHref(params:Params,patch:Record<string,string>={}){
 const q=new URLSearchParams();for(const [k,v] of Object.entries(params))if(typeof v==="string"&&!(patch.days!==undefined&&k.endsWith("_page")))q.set(k,v);for(const [k,v] of Object.entries(patch))q.set(k,v);return "?"+q.toString();
}
export function PeriodPicker({params}:{params:Params}){
 return <nav aria-label="Periodo" className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">{[7,28,90,365].map(n=><Link key={n} href={queryHref(params,{days:String(n),page:"1"})} aria-current={(params.days??"28")===String(n)?"true":undefined} className={"rounded px-3 py-1.5 text-xs "+((params.days??"28")===String(n)?"bg-primary text-primary-foreground":"hover:bg-muted")}>{n} g</Link>)}</nav>;
}
export function Explorer({title,columns,rows,params,scope="table",note}:{title:string;columns:string[];rows:Row[];params:Params;scope?:string;note?:string}){
 const searchKey=scope+"_q",sortKey=scope+"_sort",pageKey=scope+"_page";
 const search=typeof params[searchKey]==="string"?params[searchKey].slice(0,200):"";
 const rawSort=typeof params[sortKey]==="string"?params[sortKey]:"";
 const [column,dir]=rawSort.split(":");const idx=Number(column);
 const filtered=rows.filter(r=>!search||r.cells.some(c=>String(c??"").toLocaleLowerCase("it").includes(search.toLocaleLowerCase("it"))));
 if(rawSort&&Number.isInteger(idx)&&idx>=0&&idx<columns.length)filtered.sort((a,b)=>{
  const x=a.cells[idx],y=b.cells[idx];if(x==null)return y==null?0:1;if(y==null)return -1;
  return (typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),"it",{numeric:true}))*(dir==="desc"?-1:1);
 });
 const count=filtered.length,pages=Math.max(1,Math.ceil(count/25)),page=Math.min(pages,Math.max(1,Number.parseInt(String(params[pageKey]??"1"),10)||1));
 return <Card className="min-w-0"><CardHeader><CardTitle className="text-base">{title}</CardTitle>{note&&<p className="text-xs text-muted-foreground">{note}</p>}
 <form className="flex flex-wrap items-center gap-2" method="get">{Object.entries(params).filter(([k,v])=>typeof v==="string"&&k!==searchKey&&k!==pageKey).map(([k,v])=><input key={k} type="hidden" name={k} value={v as string}/>)}<input aria-label={"Cerca "+title} name={searchKey} defaultValue={search} placeholder="Cerca…" className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm"/><button className="h-9 rounded-md border px-3 text-sm">Cerca</button><span className="text-xs text-muted-foreground">{count} risultati</span></form></CardHeader>
 <CardContent className="min-w-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow>{columns.map((c,i)=><TableHead key={c} aria-sort={idx===i&&rawSort?(dir==="desc"?"descending":"ascending"):"none"}><Link href={queryHref(params,{[sortKey]:i+":"+(idx===i&&dir==="asc"?"desc":"asc"),[pageKey]:"1"})}>{c}{idx===i&&rawSort?(dir==="desc"?" ↓":" ↑"):""}</Link></TableHead>)}</TableRow></TableHeader><TableBody>{filtered.slice((page-1)*25,page*25).map(r=><TableRow key={r.id}>{r.cells.map((c,i)=><TableCell key={i} className={"whitespace-normal break-words max-w-[360px] "+(typeof c==="number"?"text-right tabular-nums":"")}>{c==null?"—":typeof c==="number"?c.toLocaleString("it-IT",{maximumFractionDigits:3}):c}</TableCell>)}</TableRow>)}{count===0&&<TableRow><TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">Nessun risultato o dato importato.</TableCell></TableRow>}</TableBody></Table></div>
 <div className="flex items-center justify-between pt-3 text-xs"><span>Pagina {page} / {pages}</span><div className="flex gap-3">{page>1&&<Link className="underline" href={queryHref(params,{[pageKey]:String(page-1)})}>Precedente</Link>}{page<pages&&<Link className="underline" href={queryHref(params,{[pageKey]:String(page+1)})}>Successiva</Link>}</div></div></CardContent></Card>;
}
