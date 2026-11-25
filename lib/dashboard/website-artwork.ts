import {createHash,randomUUID} from "node:crypto";
import {Resolver} from "node:dns/promises";
import {request as httpRequest} from "node:http";
import {request as httpsRequest} from "node:https";
import {mkdir,readFile,realpath,rename,stat,unlink,writeFile} from "node:fs/promises";
import path from "node:path";
import {declaredIcons,publicIpv4,publicWebsite,sameWebsite} from "./website-icon-discovery";
import {faviconCandidates} from "./favicon";
import {imageMime} from "./store-artwork";

const MAX_IMAGE=128*1024,MAX_HTML=2*1024*1024;
type Page={url:URL;bytes:Buffer};
type FetchPage=(url:URL,max:number,deadline:number)=>Promise<Page>;
type Status="updated"|"cached"|"unavailable";
function faviconMime(bytes:Buffer){return imageMime(bytes)??(bytes.length>=6&&bytes.readUInt16LE(0)===0&&bytes.readUInt16LE(2)===1&&bytes.readUInt16LE(4)>0?"image/x-icon":undefined);}
async function fetchPublic(url:URL,max:number,deadline:number):Promise<Page>{
 const origin=url;
 for(let hop=0;hop<=3;hop++){
  if(Date.now()>=deadline||!publicWebsite(url.href)||!sameWebsite(origin,url))throw Error("Invalid public website");
  const resolver=new Resolver({timeout:2000,tries:1}),addresses=await resolver.resolve4(url.hostname);
  if(!addresses.length||addresses.some(a=>!publicIpv4(a)))throw Error("Non-public DNS answer");
  const remaining=Math.min(7000,deadline-Date.now());if(remaining<=0)throw Error("Icon timeout");
  // Connect to a vetted IP, preserving Host and TLS SNI. No second DNS lookup,
  // cookies, authorization, proxy env or redirects to unrelated domains.
  const response=await new Promise<{status:number;location?:string;bytes:Buffer}>((resolve,reject)=>{
   const secure=url.protocol==="https:",request=secure?httpsRequest:httpRequest;
   const req=request({hostname:addresses[0],port:secure?443:80,servername:url.hostname,method:"GET",path:url.pathname+url.search,agent:false,signal:AbortSignal.timeout(remaining),headers:{Host:url.host,Accept:"text/html,image/*;q=0.9,*/*;q=0.1","Accept-Encoding":"identity","User-Agent":"OpenFindability (public favicon discovery)"}},res=>{
    const status=res.statusCode??0,location=res.headers.location;
    if(status>=300&&status<400){res.destroy();resolve({status,location,bytes:Buffer.alloc(0)});return;}
    if(status!==200||Number(res.headers["content-length"])>max){res.destroy();reject(Error("Icon response unavailable"));return;}
    const chunks:Buffer[]=[];let size=0;
    res.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>max){res.destroy(Error("Icon response too large"));return;}chunks.push(chunk);});
    res.on("end",()=>resolve({status,bytes:Buffer.concat(chunks)}));res.on("error",reject);res.on("aborted",()=>reject(Error("Icon response aborted")));
   });req.on("error",reject);req.end();
  });
  if(response.status===200)return {url,bytes:response.bytes};
  if(!response.location)throw Error("Missing redirect");
  const target=publicWebsite(new URL(response.location,url).href);
  if(!target||!sameWebsite(origin,target)||(url.protocol==="https:"&&target.protocol!=="https:"))throw Error("Unsafe redirect");
  url=target;
 }
 throw Error("Too many redirects");
}
const cacheDir=(root:string)=>path.join(root,"data","project-icons","web");
const cacheKey=(url:URL)=>createHash("sha256").update(url.origin).digest("hex");
async function cached(url:URL,root:string){
 try{const dir=await realpath(cacheDir(root)),file=await realpath(path.join(dir,cacheKey(url)+".img"));if(path.dirname(file)!==dir)return;const info=await stat(file);if(!info.isFile()||info.size>MAX_IMAGE)return;const bytes=await readFile(file);if(bytes.length<=MAX_IMAGE&&faviconMime(bytes))return bytes;}catch{}
}
export async function cachedWebsiteArtwork(website?:string,root=process.cwd()){
 const url=website&&publicWebsite(website);if(!url)return;const bytes=await cached(url,root);return bytes?"data:"+faviconMime(bytes)+";base64,"+bytes.toString("base64"):undefined;
}
async function atomic(file:string,content:Buffer|string){const tmp=file+"."+randomUUID()+".tmp";try{await writeFile(tmp,content,{flag:"wx"});await rename(tmp,file);}finally{await unlink(tmp).catch(()=>{});}}
export async function refreshWebsiteArtwork(website?:string,{root=process.cwd(),force=false,fetchPage=fetchPublic}:{root?:string;force?:boolean;fetchPage?:FetchPage}={}):Promise<Status>{
 const url=website&&publicWebsite(website);if(!url)return "unavailable";
 const old=await cached(url,root),dir=cacheDir(root),key=cacheKey(url),marker=path.join(dir,key+".attempt");
 const attempted=await stat(marker).catch(()=>null);
 if(!force&&attempted&&Date.now()-attempted.mtimeMs<(old?30:1)*86400000)return old?"cached":"unavailable";
 const deadline=Date.now()+18000;
 try{
  await mkdir(dir,{recursive:true});
  const home=new URL("/",url.origin);let page:Page|undefined;
  try{page=await fetchPage(home,MAX_HTML,deadline);}catch{}
  const fallback=faviconCandidates(page?.url.href??home.href).map(v=>new URL(v));
  const candidates=[...new Map([...(page?declaredIcons(page.bytes.toString("utf8"),page.url):[]),...fallback].map(u=>[u.href,u])).values()].slice(0,8);
  for(const candidate of candidates){if(Date.now()>=deadline)break;if(!sameWebsite(url,candidate))continue;
   try{const icon=await fetchPage(candidate,MAX_IMAGE,deadline);if(icon.bytes.length>MAX_IMAGE||!faviconMime(icon.bytes)||!sameWebsite(url,icon.url))continue;await atomic(path.join(dir,key+".img"),icon.bytes);return "updated";}catch{}
  }
  return old?"cached":"unavailable";
 }catch{return old?"cached":"unavailable";}
 finally{await atomic(marker,new Date().toISOString()).catch(()=>{});}
}
