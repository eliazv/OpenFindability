import type {AppData,AppReview} from "@/lib/types";
export type QuerySample={query:string;clicks:number;impressions:number;position:number|null};
const normalize=(s:string)=>s.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase("it").replace(/[^\p{L}\p{N}]+/gu," ").trim();
export function brandTerms(input:string){return [...new Set(input.split(/[,\n]/).map(normalize).filter(s=>s.length>=2))].slice(0,20);}
function brand(q:string,terms:string[]){if(!terms.length)return "Non classificata";const normalized=" "+normalize(q)+" ";return terms.some(t=>normalized.includes(" "+t+" "))?"Brand":"Non-brand";}
const positionBucket=(p:number)=>p<=1.5?"1":p<=3?"2–3":p<=5?"4–5":p<=10?"6–10":p<=20?"11–20":"21+";
const stop=new Set("a ad al alla alle anche che chi con da dal dalla dei del della delle di dove e ed gli i il in la le lo ma mi nel nella o per piu qua quale quando quanto se senza si su sul tra un una uno the a an of in on for to with and or is are how what where when near me".split(" "));
export function seoDiagnostics(rows:QuerySample[],terms:string[]){
 const valid=rows.filter(r=>r.impressions>0&&r.clicks>=0&&r.clicks<=r.impressions&&r.position!==null&&r.position>0);
 const groups=new Map<string,{segment:string;position:string;queries:number;impressions:number;clicks:number}>();
 for(const r of valid){const segment=brand(r.query,terms),position=positionBucket(r.position!),key=segment+"|"+position,g=groups.get(key)??{segment,position,queries:0,impressions:0,clicks:0};g.queries++;g.impressions+=r.impressions;g.clicks+=r.clicks;groups.set(key,g);}
 const benchmark=[...groups.values()].map(g=>({...g,ctr:100*g.clicks/g.impressions}));
 const opportunities=valid.flatMap(r=>{
  const segment=brand(r.query,terms),position=positionBucket(r.position!),g=groups.get(segment+"|"+position)!;
  const peerImpressions=g.impressions-r.impressions,peerQueries=g.queries-1;
  if(r.impressions<300||peerImpressions<2000||peerQueries<10)return [];
  const expected=(g.clicks-r.clicks)/peerImpressions,actual=r.clicks/r.impressions,delta=expected*r.impressions-r.clicks;
  if(expected<=0||actual>expected*.75||delta<20)return [];
  return [{query:r.query,segment,position:r.position!,impressions:r.impressions,clicks:r.clicks,ctr:actual*100,benchmark:expected*100,estimatedGap:Math.round(delta),peerQueries,peerImpressions}];
 }).sort((a,b)=>b.estimatedGap-a.estimatedGap).slice(0,50);
 const segments=new Map<string,{segment:string;queries:number;clicks:number;impressions:number}>();
 for(const r of valid){const segment=brand(r.query,terms),g=segments.get(segment)??{segment,queries:0,clicks:0,impressions:0};g.queries++;g.clicks+=r.clicks;g.impressions+=r.impressions;segments.set(segment,g);}
 // Lexical groups overlap; they are exploration aids, not distinct search intent or totals.
 const tokens=new Map<string,{token:string;queries:number;clicks:number;impressions:number;examples:string[]}>();
 for(const r of valid){for(const token of new Set(normalize(r.query).split(" ").filter(t=>t.length>=3&&!stop.has(t)&&!/^\d+$/.test(t)))){const g=tokens.get(token)??{token,queries:0,clicks:0,impressions:0,examples:[]};g.queries++;g.clicks+=r.clicks;g.impressions+=r.impressions;if(g.examples.length<3)g.examples.push(r.query);tokens.set(token,g);}}
 return {sampleQueries:valid.length,terms,segments:[...segments.values()].map(g=>({...g,ctr:100*g.clicks/g.impressions})),benchmark,opportunities,clusters:[...tokens.values()].filter(g=>g.queries>=3).sort((a,b)=>b.impressions-a.impressions).slice(0,30)};
}
const reviewPatterns:Record<string,RegExp>={
 "Crash e blocchi":/\b(crash\w*|freez\w*|blocc\w*|si chiude|non si apre|not open)\b/i,
 "Accesso e account":/\b(login|log in|accesso|account|password|registraz\w*|sign in)\b/i,
 "Pubblicità":/\b(pubblicita|advertis\w*|annunci|ads|adverts)\b/i,
 "Acquisti e abbonamenti":/\b(abbon\w*|subscription\w*|pagament\w*|payment\w*|acquist\w*|purchase\w*|rimbor\w*|refund\w*)\b/i,
 "Prestazioni":/\b(lent\w*|slow\w*|lag\w*|caricament\w*|loading|battery|batteria)\b/i,
 "Usabilità":/\b(interfaccia|interface|difficil\w*|confus\w*|intuitiv\w*|usabil\w*|navigaz\w*|navigation)\b/i,
 "Notifiche":/\b(notific\w*|notification\w*|promemoria|reminder\w*)\b/i
};
export function reviewThemes(reviews:AppReview[]){
 const unique=[...new Map(reviews.map(r=>[r.reviewId,r])).values()],textual=unique.filter(r=>r.text?.trim());
 const themes=Object.entries(reviewPatterns).map(([theme,pattern])=>{const matches=textual.filter(r=>pattern.test(normalize(r.text!)));const critical=matches.filter(r=>r.rating<=2);return {theme,count:matches.length,critical:critical.length,share:textual.length?100*matches.length/textual.length:null};}).filter(t=>t.count).sort((a,b)=>b.critical-a.critical||b.count-a.count);
 return {total:unique.length,textual:textual.length,themes};
}
export function conversionSignals(rows:NonNullable<AppData["ga4LandingMetrics"]>){
 type Group={host:string;landing:string;channel:string;sourceMedium:string;device:string;timeZone:string|null;sessions:number;weighted:number;dates:Set<string>};
 const groups=new Map<string,Group>();
 // Compare only standard-quality observations with the same acquisition and device context.
 for(const r of rows){if(r.quality!=="standard"||!Number.isFinite(r.sessionKeyEventRate)||r.sessionKeyEventRate<0||r.sessionKeyEventRate>1||r.sessions<=0||!r.timeZone)continue;
  const key=JSON.stringify([r.hostname,r.landingPage,r.channel,r.sourceMedium,r.device,r.timeZone]),g=groups.get(key)??{host:r.hostname,landing:r.landingPage,channel:r.channel,sourceMedium:r.sourceMedium,device:r.device,timeZone:r.timeZone,sessions:0,weighted:0,dates:new Set<string>()};
  g.sessions+=r.sessions;g.weighted+=r.sessions*r.sessionKeyEventRate;g.dates.add(r.date);groups.set(key,g);
 }
 const cohortKey=(g:Group)=>JSON.stringify([g.host,g.channel,g.sourceMedium,g.device,g.timeZone]);
 const cohorts=new Map<string,Group[]>();for(const g of groups.values()){const k=cohortKey(g),c=cohorts.get(k)??[];c.push(g);cohorts.set(k,c);}
 return [...groups.values()].flatMap(g=>{
  if(g.sessions<100||g.dates.size<7)return [];
  const peers=(cohorts.get(cohortKey(g))??[]).filter(x=>x!==g&&x.dates.size===g.dates.size&&[...g.dates].every(d=>x.dates.has(d)));
  const sessions=peers.reduce((s,x)=>s+x.sessions,0);
  if(peers.length<3||sessions<500)return [];
  const actual=g.weighted/g.sessions,expected=peers.reduce((s,x)=>s+x.weighted,0)/sessions,gap=(expected-actual)*g.sessions;
  if(expected-actual<.02||gap<5)return [];
  return [{host:g.host,landing:g.landing,channel:g.channel,sourceMedium:g.sourceMedium,device:g.device,sessions:g.sessions,rate:actual*100,benchmark:expected*100,estimatedGap:Math.round(gap),days:g.dates.size,peerPages:peers.length}];
 }).sort((a,b)=>b.estimatedGap-a.estimatedGap).slice(0,30);
}
