import { NextRequest, NextResponse } from "next/server";
import { sessionWallet, setPayoutWallet } from "@/server/auth";
import { clientKey, rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

// Attach the Solana address that receives the money — the only step where an
// email account ever needs a wallet.
export async function POST(req: NextRequest) {
  const limited = rateLimit(`setw:${clientKey(req)}`, 10, 60_000);
  if (limited) return limited;

  const acct = await sessionWallet();
  if (!acct) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const { wallet } = await req.json().catch(() => ({}));
  if (typeof wallet !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    return NextResponse.json({ error: "not a valid Solana address" }, { status: 400 });
  }

  await setPayoutWallet(acct, wallet);
  return NextResponse.json({ ok: true, wallet });
}
