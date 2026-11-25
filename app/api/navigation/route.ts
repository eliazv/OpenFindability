import {NextResponse} from "next/server";
import {db} from "@/lib/db/client";
import {saveNavigation} from "@/lib/dashboard/navigation-store";
export const runtime="nodejs";
export async function POST(request:Request){
 const url=new URL(request.url);
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||request.headers.get("origin")!==url.origin)return NextResponse.json({error:"Local only"},{status:403});
 try{const body=await request.json();saveNavigation(db,body.items,body.reset===true);return NextResponse.json({ok:true});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Salvataggio non riuscito."},{status:400});}
}
