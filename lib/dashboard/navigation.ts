/** Navigation is independent of analytics and sync; archived projects are hidden by default. */
export type NavigationPreference={projectId:string;favorite:boolean;archived:boolean;sidebarHidden:boolean|null;sidebarOrder:number|null};
export type NavigationItem={id:string;slug:string;name:string;hidden:boolean;hiddenOverride:boolean|null;favorite:boolean;archived:boolean;order:number|null};
export function navigationItems<T extends {id:string;slug:string;name:string}>(projects:T[],prefs:NavigationPreference[]):(T&NavigationItem)[]{
 const byId=new Map(prefs.map(p=>[p.projectId,p]));
 return projects.map(p=>{const pref=byId.get(p.id);return {...p,hidden:pref?.sidebarHidden??pref?.archived??false,hiddenOverride:pref?.sidebarHidden??null,favorite:pref?.favorite??false,archived:pref?.archived??false,order:pref?.sidebarOrder??null};}).sort((a,b)=>(a.order??Number.MAX_SAFE_INTEGER)-(b.order??Number.MAX_SAFE_INTEGER)||Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,"it")||a.id.localeCompare(b.id));
}
export type NavigationChange={id:string;hidden:boolean|null};
export function validateNavigation(input:unknown,ids:ReadonlySet<string>):NavigationChange[]{
 if(!Array.isArray(input)||input.length!==ids.size)throw new Error("Elenco progetti cambiato: ricarica e riprova.");
 const seen=new Set<string>();
 return input.map(item=>{
  if(!item||typeof item!=="object"||typeof item.id!=="string"||!ids.has(item.id)||seen.has(item.id)||(item.hidden!==null&&typeof item.hidden!=="boolean"))throw new Error("Configurazione sidebar non valida.");
  seen.add(item.id);return {id:item.id,hidden:item.hidden};
 });
}
export function moveItem<T>(items:T[],from:number,to:number):T[]{
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=items.length||to>=items.length||from===to)return items;
 const next=[...items];const [item]=next.splice(from,1);next.splice(to,0,item);return next;
}
