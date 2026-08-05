import { NextResponse } from "next/server";
import { sessionWallet } from "@/server/auth";
import { clientState } from "@/server/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const wallet = await sessionWallet();
  if (!wallet) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  return NextResponse.json(await clientState(wallet));
}
