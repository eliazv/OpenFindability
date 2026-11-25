/** Browser-only requests to the configured website; never proxy arbitrary URLs through the local server. */
export function faviconCandidates(website?:string):string[]{
 if(!website)return [];
 try{
  const url=new URL(website);
  if(!["https:","http:"].includes(url.protocol)||url.username||url.password)return [];
  return ["/favicon.ico","/favicon.png","/favicon.svg","/icon.png","/apple-touch-icon.png"].map(p=>new URL(p,url.origin).href);
 }catch{return [];}
}

/** Use a linked site even when websiteUrl was not populated manually. */
export function linkedWebsite(project:{websiteUrl?:string;gscProperty?:string;bingSiteUrl?:string;adsenseSiteDomain?:string}){
 const gsc=project.gscProperty?.startsWith("sc-domain:")?"https://"+project.gscProperty.slice(10):project.gscProperty;
 const ads=project.adsenseSiteDomain?"https://"+project.adsenseSiteDomain:undefined;
 return [project.websiteUrl,gsc,project.bingSiteUrl,ads].find(v=>faviconCandidates(v).length>0);
}
