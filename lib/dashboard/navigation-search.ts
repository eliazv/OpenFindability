import type {ProjectType} from "@/lib/types";
export type SearchProject={slug:string;name:string;type:ProjectType;hidden?:boolean};
export const globalDestinations=[
 {name:"Panoramica",href:"/",kind:"home",keywords:"home dashboard portafoglio"},
 {name:"Centro dati",href:"/data",kind:"data",keywords:"sync sincronizzazioni backup integrazioni log copertura doctor"},
 {name:"Strumenti",href:"/tools",kind:"tools",keywords:"cli comandi audit report export"},
] as const;
export function projectSections(type:ProjectType):[string,string][]{
 return [["","Panoramica"],["acquisition","Acquisizione"],...(type==="web"?[]:[["store","Store"]] as [string,string][]),["revenue","Ricavi"],["health","Salute"],["opportunities","Opportunità"],["interventions","Interventi"],["settings","Integrazioni"]];
}
export type Destination={name:string;href:string;group:"global"|"projects"|"sections";kind:string;slug?:string;hidden?:boolean;keywords?:string};
const normalize=(value:string)=>value.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase("it").trim();
export function searchDestinations(projects:SearchProject[],query:string):Destination[]{
 const terms=normalize(query).split(/\s+/).filter(Boolean),matches=(x:Destination)=>terms.every(term=>normalize(x.name+" "+(x.keywords??"")).includes(term));
 const globals:Destination[]=globalDestinations.map(x=>({...x,group:"global"}));
 const main:Destination[]=projects.filter(p=>!p.hidden||terms.length).map(p=>({name:p.name,href:"/project/"+p.slug,group:"projects",kind:"project",slug:p.slug,hidden:p.hidden,keywords:p.slug}));
 const sections:Destination[]=terms.length?projects.flatMap(p=>projectSections(p.type).filter(([segment])=>segment!=="").map(([segment,label])=>({name:p.name+" · "+label,href:"/project/"+p.slug+"/"+segment,group:"sections" as const,kind:"section",slug:p.slug,hidden:p.hidden,keywords:p.slug+" "+segment}))):[];
 return [...globals,...main,...sections].filter(matches);
}
