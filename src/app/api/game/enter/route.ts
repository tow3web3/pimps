import { NextRequest, NextResponse } from "next/server";
import { sessionWallet } from "@/server/auth";
import { db } from "@/server/db";
import { activeChallenge, activeFunded, clientState, createChallengeRun } from "@/server/engine";
import { verifyEntryPayment } from "@/server/payments";
import { rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const wallet = await sessionWallet();
  if (!wallet) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const limited = rateLimit(`enter:${wallet}`, 10, 60_000);
  if (limited) return limited;
  const { method, txSig } = await req.json().catch(() => ({}));
  if (!["usdc", "gf", "free"].includes(method)) {
    return NextResponse.json({ error: "invalid method" }, { status: 400 });
  }

  // one free roll per wallet, ever — the reward is real money, so the free
  // lane must not be a faucet you can re-open by failing on purpose
  if (method === "free") {
    const used = db
      .prepare("SELECT COUNT(*) c FROM runs WHERE wallet=? AND tier='free' AND kind='challenge'")
      .get(wallet) as { c: number };
    if (used.c > 0) {
      return NextResponse.json(
        { error: "your free roll has been used — a paid entry is required" },
        { status: 400 },
      );
    }
  }
  if (activeChallenge(wallet)) {
    return NextResponse.json({ error: "a challenge is already active" }, { status: 400 });
  }
  if (activeFunded(wallet)) {
    return NextResponse.json({ error: "your funded account is active — trade it" }, { status: 400 });
  }

  try {
    const outcome = await verifyEntryPayment(wallet, method, txSig);
    createChallengeRun(wallet, method === "free" ? "free" : "paid");
    return NextResponse.json({ payment: outcome, state: await clientState(wallet) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "payment verification failed" },
      { status: 400 },
    );
  }
}
