import {createHash,randomUUID} from "node:crypto";
import {mkdir,stat,readFile,writeFile,rename,unlink,realpath} from "node:fs/promises";
import path from "node:path";
import type {Project} from "@/lib/types";
type StoreProject=Pick<Project,"appStoreTrackId"|"playConsolePackageName">;
type Identity={source:"apple"|"play";id:string};
const MAX_IMAGE=128*1024,MAX_HTML=2*1024*1024;
export function storeIdentities(p:StoreProject):Identity[]{
 const ids:Identity[]=[];
 if(Number.isSafeInteger(p.appStoreTrackId)&&p.appStoreTrackId!>0)ids.push({source:"apple",id:String(p.appStoreTrackId)});
 if(p.playConsolePackageName&&/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(p.playConsolePackageName))ids.push({source:"play",id:p.playConsolePackageName});
 return ids;
}
export function artworkCacheName(identity:Identity){return identity.source+"-"+createHash("sha256").update(identity.id).digest("hex");}
export function imageMime(bytes:Buffer){
 return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP"?"image/webp":undefined;
}
export function allowedArtworkUrl(value:unknown,source:Identity["source"]):URL|undefined{
 if(typeof value!=="string")return;
 try{const u=new URL(value),h=u.hostname.toLowerCase();
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash)return;
  if(source==="apple"?(h==="mzstatic.com"||h.endsWith(".mzstatic.com")):(h==="play-lh.googleusercontent.com"))return u;
 }catch{}
}
export function appleArtwork(payload:unknown,id:string){
 if(!payload||typeof payload!=="object"||!Array.isArray((payload as {results?:unknown}).results))return;
 const rows=(payload as {results:Record<string,unknown>[]}).results;
 const row=rows.find(r=>r&&String(r.trackId)===id&&r.kind==="software");
 return allowedArtworkUrl(row?.artworkUrl100,"apple")??allowedArtworkUrl(row?.artworkUrl60,"apple");
}
export function playArtwork(html:string){
 // Read only the public listing's OpenGraph image. No private API, no arbitrary URLs.
 for(const match of html.matchAll(/<meta\b[^>]{0,4096}>/gi)){
  const attrs=new Map([...match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),m[2]??m[3]]));
  if(attrs.get("property")!=="og:image"&&attrs.get("name")!=="og:image")continue;
  const raw=attrs.get("content")?.replace(/&amp;/g,"&");
  const u=allowedArtworkUrl(raw,"play");if(u)return u;
 }
}
async function boundedResponse(url:URL,max:number,request:typeof fetch){
 const res=await request(url,{redirect:"error",signal:AbortSignal.timeout(7000),headers:{Accept:"*/*","User-Agent":"OpenFindability/0.1 (public store artwork)"}});
 if(!res.ok||!res.body)throw new Error("Store artwork unavailable");
 if(Number(res.headers.get("content-length"))>max){await res.body.cancel();throw new Error("Response too large");}
 const reader=res.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error("Response too large");chunks.push(value);}return Buffer.concat(chunks);}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
const dir=(root:string)=>path.join(root,"data","project-icons","store");
async function safeCached(root:string,file:string){
 try{const base=await realpath(dir(root)),resolved=await realpath(file);if(path.dirname(resolved)!==base)return;const info=await stat(resolved);if(!info.isFile()||info.size>MAX_IMAGE)return;const bytes=await readFile(resolved);return bytes.length<=MAX_IMAGE&&imageMime(bytes)?bytes:undefined;}catch{return;}
}
export async function cachedStoreArtwork(project:StoreProject,root=process.cwd()){
 for(const id of storeIdentities(project)){const bytes=await safeCached(root,path.join(dir(root),artworkCacheName(id)+".img"));if(bytes)return "data:"+imageMime(bytes)+";base64,"+bytes.toString("base64");}
}
async function lookup(id:Identity,request:typeof fetch){
 if(id.source==="apple"){
  for(const country of ["it","us"]){try{const url=new URL("https://itunes.apple.com/lookup");url.search=new URLSearchParams({id:id.id,country,entity:"software"}).toString();
   const bytes=await boundedResponse(url,MAX_HTML,request);const artwork=appleArtwork(JSON.parse(bytes.toString("utf8")),id.id);if(artwork)return artwork;}catch{}}
 }else{
  const url=new URL("https://play.google.com/store/apps/details");url.search=new URLSearchParams({id:id.id,hl:"it",gl:"IT"}).toString();
  return playArtwork((await boundedResponse(url,MAX_HTML,request)).toString("utf8"));
 }
}
async function atomicWrite(file:string,bytes:Buffer|string){
 const tmp=file+"."+randomUUID()+".tmp";try{await writeFile(tmp,bytes,{flag:"wx"});await rename(tmp,file);}finally{await unlink(tmp).catch(()=>{});}
}
const inflight=new Map<string,Promise<"updated"|"cached"|"unavailable">>();
async function refreshOne(id:Identity,root:string,force:boolean,request:typeof fetch):Promise<"updated"|"cached"|"unavailable">{
 const name=artworkCacheName(id),file=path.join(dir(root),name+".img"),marker=path.join(dir(root),name+".attempt");
 const cached=await safeCached(root,file),age=Date.now()-(await stat(marker).catch(()=>null))?.mtimeMs!;
 if(!force&&Number.isFinite(age)&&age<(cached?30:1)*86400000)return cached?"cached":"unavailable";
 await mkdir(dir(root),{recursive:true});
 try{const artwork=await lookup(id,request);if(!artwork)return cached?"cached":"unavailable";const bytes=await boundedResponse(artwork,MAX_IMAGE,request);if(!imageMime(bytes))return cached?"cached":"unavailable";await atomicWrite(file,bytes);return "updated";}
 catch{return cached?"cached":"unavailable";}
 finally{await atomicWrite(marker,new Date().toISOString()).catch(()=>{});}
}
export async function refreshStoreArtwork(project:StoreProject,{root=process.cwd(),force=false,request=fetch}:{root?:string;force?:boolean;request?:typeof fetch}={}){
 for(const identity of storeIdentities(project)){
  const key=path.join(dir(root),artworkCacheName(identity));let task=inflight.get(key);
  if(!task){task=refreshOne(identity,root,force,request).finally(()=>inflight.delete(key));inflight.set(key,task);}
  const status=await task;if(status!=="unavailable")return status;
 }
 return "unavailable" as const;
}
