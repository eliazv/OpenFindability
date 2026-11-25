/** Extract public favicon links from the site's own document, not guessed filenames. */
export function publicWebsite(value:string):URL|undefined{
 try{const u=new URL(value);if(!["http:","https:"].includes(u.protocol)||u.username||u.password||u.port||!u.hostname.includes(".")||!/[a-z]/i.test(u.hostname)||u.hostname.endsWith(".")||/\.(local|localhost|internal|home|lan|test|invalid)$/i.test(u.hostname))return;u.hash="";return u;}catch{return;}
}
export function sameWebsite(a:URL,b:URL){
 return a.hostname.replace(/^www\./i,"").toLowerCase()===b.hostname.replace(/^www\./i,"").toLowerCase();
}
export function declaredIcons(html:string,page:URL):URL[]{
 const head=html.split(/<\/head\s*>/i)[0].replace(/<!--[\s\S]*?-->/g,"").replace(/<script\b[\s\S]*?<\/script\s*>/gi,"");
 const found:{url:URL;priority:number}[]=[];
 for(const match of head.matchAll(/<link\b[^>]{0,4096}>/gi)){
  const attrs=new Map<string,string>();
  for(const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))/g))attrs.set(attr[1].toLowerCase(),attr[2]??attr[3]??attr[4]);
  const rel=(attrs.get("rel")??"").toLowerCase().split(/\s+/),href=attrs.get("href");
  if(!href||!rel.some(v=>v==="icon"||v==="apple-touch-icon"||v==="apple-touch-icon-precomposed"))continue;
  try{const u=publicWebsite(new URL(href.replace(/&amp;/gi,"&"),page).href);if(!u||!sameWebsite(page,u))continue;found.push({url:u,priority:rel.includes("icon")?0:1});}catch{}
 }
 return [...new Map(found.sort((a,b)=>a.priority-b.priority).map(r=>[r.url.href,r.url])).values()];
}
/** Conservative IPv4 allowlist: exclude special-use/private address space. */
export function publicIpv4(address:string){
 const p=address.split(".").map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 const [a,b,c]=p;
 return a>0&&a<224&&a!==10&&a!==127&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0||b===88&&c===99))&&!(a===198&&(b===18||b===19||b===51&&c===100))&&!(a===203&&b===0&&c===113);
}
