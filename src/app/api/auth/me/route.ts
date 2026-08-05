import { NextResponse } from "next/server";
import { sessionWallet } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ wallet: await sessionWallet() });
}
