import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import { ensureSchema, sql, type Row } from "@/server/sql";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/**
 * Pays due withdrawals. Serverless has no background workers, so this runs on
 * a schedule (vercel.json) instead of a timer. Guardrails: the 24h delay set at
 * request time, a rolling daily ceiling, and it stays dormant until a payout
 * wallet is configured.
 */
export async function GET(req: NextRequest) {
  // Vercel Cron sends this header; a manual call must carry the secret
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromVercelCron = req.headers.get("x-vercel-cron") !== null;
  if (!fromVercelCron && (!secret || auth !== `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const key = process.env.HOT_WALLET_SECRET_KEY;
  if (!key) return NextResponse.json({ ok: true, note: "payout wallet not configured — idle" });

  const due = (await sql`
    SELECT id, wallet, payout_usd FROM withdrawals
    WHERE status = 'pending' AND payable_at <= ${Date.now()}
    ORDER BY id LIMIT 5
  `) as Row[];
  if (due.length === 0) return NextResponse.json({ ok: true, paid: 0 });

  const cap = Number(process.env.PAYOUT_DAILY_CAP_USD ?? 500);
  const spentRows = (await sql`
    SELECT COALESCE(SUM(payout_usd), 0) AS s FROM withdrawals
    WHERE status = 'paid' AND paid_at > ${Date.now() - 24 * 3600_000}
  `) as Row[];
  let spent = Number(spentRows[0].s);

  let payer: Keypair;
  try {
    payer = Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    return NextResponse.json({ error: "HOT_WALLET_SECRET_KEY is not valid base58" }, { status: 500 });
  }

  const helius = process.env.HELIUS_API_KEY;
  const conn = new Connection(
    helius ? `https://mainnet.helius-rpc.com/?api-key=${helius}` : "https://api.mainnet-beta.solana.com",
    "confirmed",
  );

  const results: string[] = [];
  for (const w of due) {
    // an email account that hasn't attached a payout wallet yet: its prize
    // sits under the opaque em:… id — leave it pending, never try to send
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w.wallet as string)) {
      results.push(`#${w.id} waiting — no payout wallet attached yet`);
      continue;
    }
    const amountUsd = Number(w.payout_usd);
    if (spent + amountUsd > cap) {
      results.push(`#${w.id} deferred — daily cap $${cap} reached`);
      break;
    }
    // claim it before sending: a second cron run must never double-pay
    const claimed = (await sql`
      UPDATE withdrawals SET status = 'paying' WHERE id = ${w.id} AND status = 'pending' RETURNING id
    `) as Row[];
    if (claimed.length === 0) continue;

    try {
      const dest = new PublicKey(w.wallet as string);
      const from = getAssociatedTokenAddressSync(USDC, payer.publicKey);
      const to = getAssociatedTokenAddressSync(USDC, dest);
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, to, dest, USDC),
        createTransferCheckedInstruction(from, USDC, to, payer.publicKey, Math.round(amountUsd * 1e6), 6),
      );
      const sig = await conn.sendTransaction(tx, [payer]);
      await conn.confirmTransaction(sig, "confirmed");
      await sql`UPDATE withdrawals SET status='paid', paid_at=${Date.now()}, tx_sig=${sig} WHERE id=${w.id}`;
      spent += amountUsd;
      results.push(`#${w.id} paid $${amountUsd.toFixed(2)} → ${sig.slice(0, 10)}…`);
    } catch (e) {
      // release it so the next run retries rather than losing the payout
      await sql`UPDATE withdrawals SET status='pending' WHERE id=${w.id} AND status='paying'`;
      results.push(`#${w.id} failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
