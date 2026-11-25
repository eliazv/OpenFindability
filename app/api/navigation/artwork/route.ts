import {NextResponse} from "next/server";
import {readProjects} from "@/lib/store";
import {refreshStoreArtwork,storeIdentities} from "@/lib/dashboard/store-artwork";
export const runtime="nodejs";
let busy=false;
export async function POST(request:Request){
 const url=new URL(request.url);
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||request.headers.get("origin")!==url.origin)return NextResponse.json({error:"Local only"},{status:403});
 if(busy)return NextResponse.json({error:"Aggiornamento icone già in corso."},{status:409});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object"||(body.slug!==undefined&&typeof body.slug!=="string"))return NextResponse.json({error:"Richiesta non valida."},{status:400});
 busy=true;try{
  const projects=(await readProjects()).filter(p=>(!body.slug||p.slug===body.slug)&&storeIdentities(p).length);
  const results:{slug:string;status:string}[]=[];
  for(let i=0;i<projects.length;i+=3){results.push(...await Promise.all(projects.slice(i,i+3).map(async p=>({slug:p.slug,status:await refreshStoreArtwork(p,{force:!!body.slug}).catch(()=>"unavailable")}))));}
  return NextResponse.json({results});
 }catch{return NextResponse.json({error:"Aggiornamento icone non riuscito."},{status:500});}finally{busy=false;}
}
