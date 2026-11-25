import {localRequestError} from "@/lib/dashboard/local-request";
import { NextResponse } from "next/server";
import { getDoctorReport } from "@/lib/doctor";

export async function GET(request:Request) {
  const denied=localRequestError(request);if(denied)return NextResponse.json({error:denied},{status:403});
  return NextResponse.json(await getDoctorReport());
}
