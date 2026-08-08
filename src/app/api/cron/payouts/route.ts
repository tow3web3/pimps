import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import { ensureSchema, sql, type Row } from "@/server/sql";
import { getConfig } from "@/server/config";
import { RULES } from "@/lib/rules";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/**
 * Pays due withdrawals. Serverless has no background workers, so this runs on
 * a schedule plus an instant trigger on every win.
 *
 * MONEY DISCIPLINE — every rule exists because its absence loses real money:
 *  - the tx is SIGNED LOCALLY and its signature recorded BEFORE broadcast, so
 *    there is never a moment where funds can move without a trace in the DB
 *  - a send/confirm failure NEVER flips the row back to 'pending' by itself:
 *    the signature may still land. The reaper below asks the CHAIN and only
 *    re-queues once the recorded signature is provably dead
 *  - the daily cap counts in-flight ('paying') rows, not just settled ones
 *  - while payments are simulated (no treasury configured), the payer idles:
 *    test-mode entries must never turn into live USDC
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
  if (!(await getConfig()).treasuryWallet) {
    return NextResponse.json({ ok: true, note: "payments are simulated — payouts idle" });
  }

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

  const now = Date.now();
  const results: string[] = [];

  // ── self-heal: a crash inside securePass can leave a cleared run with no
  // prize row. Every pass re-derives what a winner is owed, idempotently.
  await sql`
    INSERT INTO withdrawals(wallet, run_id, profit_usd, payout_usd, status, requested_at, payable_at)
    SELECT COALESCE(u.payout_wallet, r.wallet),
           r.id,
           CASE WHEN r.tier = 'free' THEN ${RULES.freeRewardUsd} ELSE ${RULES.entryFeeUsd * RULES.fundedMultiple} END,
           CASE WHEN r.tier = 'free' THEN ${RULES.freeRewardUsd} ELSE ${RULES.entryFeeUsd * RULES.fundedMultiple} END,
           'pending', ${now}, ${now}
    FROM runs r LEFT JOIN users u ON u.wallet = r.wallet
    WHERE r.kind = 'challenge' AND r.status = 'funded'
      AND NOT EXISTS (SELECT 1 FROM withdrawals w WHERE w.run_id = r.id)
  `.catch(() => {});

  // ── reaper: rows stuck in 'paying' (an instance died mid-flight). Ask the
  // chain, never guess. Two minutes is far beyond any legitimate in-flight
  // window inside this function.
  const stuck = (await sql`
    SELECT id, tx_sig, paying_at FROM withdrawals
    WHERE status = 'paying' AND COALESCE(paying_at, 0) < ${now - 2 * 60_000}
    LIMIT 10
  `) as Row[];
  for (const s of stuck) {
    const sig = s.tx_sig as string | null;
    if (!sig) {
      // claimed but never signed: nothing can have moved — safe to re-queue
      await sql`UPDATE withdrawals SET status='pending' WHERE id=${s.id} AND status='paying'`;
      results.push(`#${s.id} reaped — never signed, re-queued`);
      continue;
    }
    try {
      const st = await conn.getSignatureStatuses([sig], { searchTransactionHistory: true });
      const info = st.value[0];
      if (info && !info.err && (info.confirmationStatus === "confirmed" || info.confirmationStatus === "finalized")) {
        await sql`UPDATE withdrawals SET status='paid', paid_at=${Date.now()} WHERE id=${s.id} AND status='paying'`;
        results.push(`#${s.id} reaped — landed on-chain, marked paid`);
      } else if (!info && Number(s.paying_at ?? 0) < now - 5 * 60_000) {
        // not found anywhere and the blockhash died minutes ago: provably dead
        await sql`UPDATE withdrawals SET status='pending', tx_sig=NULL WHERE id=${s.id} AND status='paying'`;
        results.push(`#${s.id} reaped — signature dead, re-queued`);
      } else if (info?.err) {
        await sql`UPDATE withdrawals SET status='pending', tx_sig=NULL WHERE id=${s.id} AND status='paying'`;
        results.push(`#${s.id} reaped — tx failed on-chain, re-queued`);
      }
      // still ambiguous → leave it; the next pass re-checks
    } catch {
      /* chain unreachable — resolve on the next pass */
    }
  }

  const due = (await sql`
    SELECT id, wallet, payout_usd FROM withdrawals
    WHERE status = 'pending' AND payable_at <= ${now}
    ORDER BY id LIMIT 5
  `) as Row[];
  if (due.length === 0) return NextResponse.json({ ok: true, paid: 0, results });

  const cap = Number(process.env.PAYOUT_DAILY_CAP_USD ?? 500);
  // in-flight money counts against the cap: concurrent runs must not each
  // believe the whole budget is still available
  const spentRows = (await sql`
    SELECT COALESCE(SUM(payout_usd), 0) AS s FROM withdrawals
    WHERE (status = 'paid' AND paid_at > ${now - 24 * 3600_000}) OR status = 'paying'
  `) as Row[];
  let spent = Number(spentRows[0].s);

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
    // claim it before anything moves: a second run must never double-pay
    const claimed = (await sql`
      UPDATE withdrawals SET status = 'paying', paying_at = ${Date.now()}
      WHERE id = ${w.id} AND status = 'pending' RETURNING id
    `) as Row[];
    if (claimed.length === 0) continue;
    spent += amountUsd;

    // destination problems are PERMANENT — retrying every 5 minutes forever
    // is noise, and a bad address must never bounce back to 'pending'
    let dest: PublicKey, from: PublicKey, to: PublicKey;
    try {
      dest = new PublicKey(w.wallet as string);
      from = getAssociatedTokenAddressSync(USDC, payer.publicKey);
      to = getAssociatedTokenAddressSync(USDC, dest);
    } catch (e) {
      await sql`UPDATE withdrawals SET status='blocked' WHERE id=${w.id} AND status='paying'`;
      spent -= amountUsd;
      results.push(`#${w.id} blocked — invalid destination (${e instanceof Error ? e.message : "?"})`);
      continue;
    }

    let sig: string | null = null;
    try {
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, to, dest, USDC),
        createTransferCheckedInstruction(from, USDC, to, payer.publicKey, Math.round(amountUsd * 1e6), 6),
      );
      const latest = await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = latest.blockhash;
      tx.lastValidBlockHeight = latest.lastValidBlockHeight;
      tx.feePayer = payer.publicKey;
      tx.sign(payer);
      sig = bs58.encode(tx.signature!);

      // the signature is on record BEFORE the network ever sees the tx
      await sql`UPDATE withdrawals SET tx_sig=${sig} WHERE id=${w.id} AND status='paying'`;

      await conn.sendRawTransaction(tx.serialize());
      await conn.confirmTransaction(
        { signature: sig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
        "confirmed",
      );
      await sql`UPDATE withdrawals SET status='paid', paid_at=${Date.now()} WHERE id=${w.id}`;
      results.push(`#${w.id} paid $${amountUsd.toFixed(2)} → ${sig.slice(0, 10)}…`);
    } catch (e) {
      if (sig === null) {
        // failed before signing: nothing can have moved — safe to re-queue now
        await sql`UPDATE withdrawals SET status='pending' WHERE id=${w.id} AND status='paying'`;
        spent -= amountUsd;
      }
      // signed already? leave it 'paying' — the tx may still land, and only
      // the reaper (which asks the chain) may re-queue or settle it
      results.push(`#${w.id} ${sig ? "in-flight, reaper will settle" : "failed"}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
