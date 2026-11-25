import {NextResponse} from "next/server";
import {createBackup} from "@/lib/db/backup";
export const runtime="nodejs";
let busy=false;
export async function POST(request:Request){
 const url=new URL(request.url);
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||request.headers.get("origin")!==url.origin)return NextResponse.json({error:"Local only"},{status:403});
 if(busy)return NextResponse.json({error:"Backup già in corso."},{status:409});
 busy=true;try{const {name,size}=await createBackup();return NextResponse.json({name,size});}catch{return NextResponse.json({error:"Backup non riuscito."},{status:500});}finally{busy=false;}
}
