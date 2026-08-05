import { NextResponse } from "next/server";
import { sessionWallet } from "@/server/auth";
import { clientState, requestWithdrawal } from "@/server/engine";

export const dynamic = "force-dynamic";

export async function POST() {
  const wallet = await sessionWallet();
  if (!wallet) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  try {
    const r = await requestWithdrawal(wallet);
    return NextResponse.json({ ...r, state: await clientState(wallet) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "rejected" }, { status: 400 });
  }
}
