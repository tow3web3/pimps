import { NextRequest, NextResponse } from "next/server";
import { sessionWallet } from "@/server/auth";
import { sql, type Row } from "@/server/sql";
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

  // ORDER MATTERS: an active run must answer "already active" (the client
  // routes you to your terminal) BEFORE the free-roll check — otherwise a
  // brand-new player who just took their free seat gets told their free
  // roll "has been used" on the very next click
  if (await activeChallenge(wallet)) {
    return NextResponse.json({ error: "a challenge is already active" }, { status: 400 });
  }
  if (await activeFunded(wallet)) {
    return NextResponse.json({ error: "you already have an active run" }, { status: 400 });
  }

  // one free roll per wallet, ever — the reward is real money, so the free
  // lane must not be a faucet you can re-open by failing on purpose
  if (method === "free") {
    const used = (await sql`
      SELECT COUNT(*)::int AS c FROM runs
      WHERE wallet = ${wallet} AND tier = 'free' AND kind = 'challenge'
    `) as Row[];
    if (Number(used[0].c) > 0) {
      return NextResponse.json(
        { error: "your free roll has been used — a paid entry is required" },
        { status: 400 },
      );
    }
  }

  try {
    const outcome = await verifyEntryPayment(wallet, method, txSig);
    try {
      await createChallengeRun(wallet, method === "free" ? "free" : "paid");
    } catch (e) {
      // the payment verified but no seat was created (e.g. a concurrent enter
      // won the race) — release the signature so the SAME payment can seat
      // them on retry instead of being burned
      if (txSig) {
        await sql`DELETE FROM payments WHERE tx_sig = ${txSig} AND wallet = ${wallet}`.catch(
          () => {},
        );
      }
      throw e;
    }
    return NextResponse.json({ payment: outcome, state: await clientState(wallet) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "payment verification failed" },
      { status: 400 },
    );
  }
}
