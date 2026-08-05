import { NextRequest, NextResponse } from "next/server";
import { sessionWallet } from "@/server/auth";
import { clientState, sell } from "@/server/engine";
import { rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const wallet = await sessionWallet();
  if (!wallet) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  // exits share the trade budget but are never blocked below a safe floor:
  // a trader must always be able to close a position
  const limited = rateLimit(`sell:${wallet}`, 120, 60_000);
  if (limited) return limited;
  const { mint, fraction } = await req.json().catch(() => ({}));
  if (typeof mint !== "string" || typeof fraction !== "number" || !isFinite(fraction)) {
    return NextResponse.json({ error: "invalid order" }, { status: 400 });
  }
  try {
    await sell(wallet, mint, fraction);
    return NextResponse.json({ state: await clientState(wallet) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "rejected" }, { status: 400 });
  }
}
