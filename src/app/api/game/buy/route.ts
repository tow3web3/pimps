import { NextRequest, NextResponse } from "next/server";
import { sessionWallet } from "@/server/auth";
import { buy, clientState } from "@/server/engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const wallet = await sessionWallet();
  if (!wallet) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const { mint, solAmount } = await req.json().catch(() => ({}));
  if (typeof mint !== "string" || typeof solAmount !== "number" || !isFinite(solAmount)) {
    return NextResponse.json({ error: "invalid order" }, { status: 400 });
  }
  try {
    await buy(wallet, mint, solAmount);
    return NextResponse.json({ state: await clientState(wallet) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "rejected" }, { status: 400 });
  }
}
