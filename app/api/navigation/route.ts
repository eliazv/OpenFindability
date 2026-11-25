import {localRequestError} from "@/lib/dashboard/local-request";
import {NextResponse} from "next/server";
import {db} from "@/lib/db/client";
import {saveNavigation} from "@/lib/dashboard/navigation-store";
export const runtime="nodejs";
export async function POST(request:Request){
 const denied=localRequestError(request,true);if(denied)return NextResponse.json({error:denied},{status:403});
 try{const body=await request.json();saveNavigation(db,body.items,body.reset===true);return NextResponse.json({ok:true});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Salvataggio non riuscito."},{status:400});}
}
