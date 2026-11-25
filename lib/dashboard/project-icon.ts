import {cachedStoreArtwork} from "./store-artwork";
import { cache } from "react";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Project } from "@/lib/types";

const inside=(root:string,file:string)=>{const relative=path.relative(root,file);return relative!==""&&!path.isAbsolute(relative)&&relative!==".."&&!relative.startsWith(".."+path.sep);};
async function image(root:string,candidate:string):Promise<string|undefined>{
 try{
  const base=await realpath(root),file=await realpath(candidate);
  if(!inside(base,file))return;
  const info=await stat(file);if(!info.isFile()||info.size>128*1024)return;
  const bytes=await readFile(file);if(bytes.length>128*1024)return;
  const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":
    bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":
    bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP"?"image/webp":undefined;
  return mime?"data:"+mime+";base64,"+bytes.toString("base64"):undefined;
 }catch{return undefined;}
}
const resolveLocalIcon=cache(async (slug:string,flutterProjectPath?:string):Promise<string|undefined>=>{
 const project={slug,flutterProjectPath};
 if(/^[a-zA-Z0-9_-]+$/.test(project.slug)){
  const dir=path.join(process.cwd(),"data","project-icons");
  const custom=await image(dir,path.join(dir,project.slug+".png"));if(custom)return custom;
 }
 if(!project.flutterProjectPath)return;
 try{
  const root=await realpath(project.flutterProjectPath);
  for(const relative of ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png","android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png","ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png"]){const result=await image(root,path.join(root,relative));if(result)return result;}
  const config=await realpath(path.join(root,"store","studio","studio.config.json"));
  if(!inside(root,config))return;
  const info=await stat(config);if(!info.isFile()||info.size>64*1024)return;
  const value=JSON.parse(await readFile(config,"utf8")) as {icon?:unknown};
  if(typeof value.icon!=="string"||path.isAbsolute(value.icon))return;
  return await image(root,path.resolve(path.dirname(config),value.icon));
 }catch{return undefined;}
});
export async function projectIcon(project:Pick<Project,"slug"|"flutterProjectPath"|"appStoreTrackId"|"playConsolePackageName">){return await resolveLocalIcon(project.slug,project.flutterProjectPath)??await cachedStoreArtwork(project);}
