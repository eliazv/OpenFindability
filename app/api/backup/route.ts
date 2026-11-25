import {localRequestError} from "@/lib/dashboard/local-request";
import {NextResponse} from "next/server";
import {createBackup} from "@/lib/db/backup";
export const runtime="nodejs";
let busy=false;
export async function POST(request:Request){
 const denied=localRequestError(request,true);if(denied)return NextResponse.json({error:denied},{status:403});
 if(busy)return NextResponse.json({error:"Backup già in corso."},{status:409});
 busy=true;try{const {name,size}=await createBackup();return NextResponse.json({name,size});}catch{return NextResponse.json({error:"Backup non riuscito."},{status:500});}finally{busy=false;}
}
