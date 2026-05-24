import { NextResponse } from "next/server";
import { getDoctorReport } from "@/lib/doctor";

export async function GET() {
  return NextResponse.json(await getDoctorReport());
}
