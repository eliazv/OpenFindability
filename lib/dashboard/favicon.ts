/** Browser-only requests to the configured website; never proxy arbitrary URLs through the local server. */
export function faviconCandidates(website?:string):string[]{
 if(!website)return [];
 try{
  const url=new URL(website);
  if(!["https:","http:"].includes(url.protocol)||url.username||url.password)return [];
  return ["/favicon.ico","/favicon.png","/apple-touch-icon.png"].map(p=>new URL(p,url.origin).href);
 }catch{return [];}
}
