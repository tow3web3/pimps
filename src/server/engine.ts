// The authoritative game. Every rule the client displays is ENFORCED here:
// prices come from server-side marks, fills mutate Postgres, and the fail /
// pass decisions never depend on anything the browser sends.
//
// Money-moving writes are CONDITIONAL updates guarded by their own precondition
// (`WHERE cash_sol >= amount`), so two concurrent requests on different
// serverless instances cannot spend the same balance twice.

import { ensureSchema, sql, type Row } from "./sql";
import { getMarks, type Mark } from "./prices";
import { eligibleMints } from "./eligibility";
import { CHALLENGE_MS, RULES } from "@/lib/rules";

export interface RunRow {
  id: number;
  wallet: string;
  kind: "challenge" | "funded";
  tier: "free" | "paid";
  phase: number;
  attempt: number;
  status: string;
  fail_reason: string | null;
  cash_sol: number;
  start_sol: number;
  principal_usd: number | null;
  started_at: number;
  ends_at: number | null;
  ended_at: number | null;
  trade_count: number;
}

export interface PosRow {
  run_id: number;
  mint: string;
  pair_address: string;
  symbol: string;
  name: string;
  image_url: string | null;
  qty: number;
  invested_sol: number;
  avg_price_sol: number;
  avg_price_usd: number;
}

const toRun = (r: Row): RunRow => ({
  id: Number(r.id),
  wallet: r.wallet as string,
  kind: r.kind as "challenge" | "funded",
  tier: r.tier as "free" | "paid",
  phase: Number(r.phase),
  attempt: Number(r.attempt),
  status: r.status as string,
  fail_reason: (r.fail_reason as string) ?? null,
  cash_sol: Number(r.cash_sol),
  start_sol: Number(r.start_sol),
  principal_usd: r.principal_usd === null ? null : Number(r.principal_usd),
  started_at: Number(r.started_at),
  ends_at: r.ends_at === null ? null : Number(r.ends_at),
  ended_at: r.ended_at === null ? null : Number(r.ended_at),
  trade_count: Number(r.trade_count),
});

const toPos = (r: Row): PosRow => ({
  run_id: Number(r.run_id),
  mint: r.mint as string,
  pair_address: r.pair_address as string,
  symbol: r.symbol as string,
  name: r.name as string,
  image_url: (r.image_url as string) ?? null,
  qty: Number(r.qty),
  invested_sol: Number(r.invested_sol),
  avg_price_sol: Number(r.avg_price_sol),
  avg_price_usd: Number(r.avg_price_usd ?? 0),
});

async function positionsOf(runId: number): Promise<PosRow[]> {
  const rows = (await sql`SELECT * FROM positions WHERE run_id = ${runId}`) as Row[];
  return rows.map(toPos);
}

export function equityOf(
  run: { cash_sol: number },
  positions: PosRow[],
  marks: Record<string, Mark>,
): number {
  let equity = run.cash_sol;
  for (const p of positions) {
    const mark = marks[p.mint];
    const px = mark ? mark.priceSol : p.avg_price_sol;
    equity += p.qty * px * (1 - RULES.feeRate);
  }
  return equity;
}

function failFloorOf(run: RunRow): number {
  return run.kind === "challenge"
    ? (RULES.failFloor / RULES.startBalance) * run.start_sol
    : run.start_sol * 0.5;
}

async function recordTrade(
  run: RunRow,
  side: "buy" | "sell",
  mark: Mark,
  qty: number,
  solAmount: number,
  feeSol: number,
  pnlSol: number | null,
) {
  await sql`
    INSERT INTO trades(run_id, ts, side, mint, symbol, qty, price_sol, sol_amount, fee_sol, pnl_sol)
    VALUES (${run.id}, ${Date.now()}, ${side}, ${mark.mint}, ${mark.symbol}, ${qty},
            ${mark.priceSol}, ${solAmount}, ${feeSol}, ${pnlSol})
  `;
  await sql`UPDATE runs SET trade_count = trade_count + 1 WHERE id = ${run.id}`;
}

export async function activeChallenge(wallet: string): Promise<RunRow | undefined> {
  await ensureSchema();
  const rows = (await sql`
    SELECT * FROM runs WHERE wallet = ${wallet} AND kind = 'challenge' AND status = 'active'
    ORDER BY id DESC LIMIT 1
  `) as Row[];
  return rows.length ? toRun(rows[0]) : undefined;
}

export async function activeFunded(wallet: string): Promise<RunRow | undefined> {
  await ensureSchema();
  const rows = (await sql`
    SELECT * FROM runs WHERE wallet = ${wallet} AND kind = 'funded' AND status = 'active'
    ORDER BY id DESC LIMIT 1
  `) as Row[];
  return rows.length ? toRun(rows[0]) : undefined;
}

async function lastChallenge(wallet: string): Promise<RunRow | undefined> {
  const rows = (await sql`
    SELECT * FROM runs WHERE wallet = ${wallet} AND kind = 'challenge' ORDER BY id DESC LIMIT 1
  `) as Row[];
  return rows.length ? toRun(rows[0]) : undefined;
}

/** apply expiry + drawdown; returns the run as it now stands */
export async function settle(run: RunRow): Promise<RunRow> {
  if (run.status !== "active") return run;
  const positions = await positionsOf(run.id);
  const { marks } = await getMarks(positions.map((p) => p.mint));
  const equity = equityOf(run, positions, marks);

  if (run.kind === "challenge" && run.ends_at && Date.now() > run.ends_at) {
    await sql`UPDATE runs SET status='failed', fail_reason='expired', ended_at=${Date.now()} WHERE id=${run.id} AND status='active'`;
    return { ...run, status: "failed", fail_reason: "expired" };
  }
  if (equity < failFloorOf(run)) {
    await sql`UPDATE runs SET status='failed', fail_reason='drawdown', ended_at=${Date.now()} WHERE id=${run.id} AND status='active'`;
    return { ...run, status: "failed", fail_reason: "drawdown" };
  }
  return run;
}

export async function createChallengeRun(
  wallet: string,
  tier: "free" | "paid",
): Promise<void> {
  const last = await lastChallenge(wallet);
  if (last && last.status === "active") throw new Error("a run is already active");
  const attempt = last ? last.attempt + 1 : 1;
  const now = Date.now();
  await sql`
    INSERT INTO runs(wallet, kind, tier, phase, attempt, status, cash_sol, start_sol, started_at, ends_at)
    VALUES (${wallet}, 'challenge', ${tier}, 0, ${attempt}, 'active',
            ${RULES.startBalance}, ${RULES.startBalance}, ${now}, ${now + CHALLENGE_MS})
  `;
}

export async function buy(wallet: string, mint: string, solAmount: number): Promise<void> {
  let run = (await activeChallenge(wallet)) ?? (await activeFunded(wallet));
  if (!run) throw new Error("no active run — take a seat first");
  run = await settle(run);
  if (run.status !== "active") throw new Error("run is not active");

  const positions = await positionsOf(run.id);
  const { marks } = await getMarks([mint, ...positions.map((p) => p.mint)]);
  const mark = marks[mint];
  if (!mark) throw new Error("no live market for this token");
  // provenance: either the universe sweep vouches for it (pump.fun's own
  // listing) or the mint carries the modern vanity suffix
  if (!eligibleMints.has(mint) && !mint.toLowerCase().endsWith(RULES.pumpSuffix)) {
    throw new Error("not a pump.fun token");
  }
  if (mark.mcapUsd < RULES.minMcapUsd * 0.9) throw new Error("market cap below the floor");
  if (mark.liqUsd < 15_000) throw new Error("pool liquidity below the floor");
  if (solAmount < RULES.minOrderSol) throw new Error("order below minimum");

  const equity = equityOf(run, positions, marks);
  const pos = positions.find((p) => p.mint === mint);
  const posValue = pos ? pos.qty * mark.priceSol : 0;
  if (posValue + solAmount > RULES.maxExposure * equity + 1e-9) {
    throw new Error(`${RULES.maxExposure * 100}% exposure cap exceeded`);
  }

  const feeSol = solAmount * RULES.feeRate;
  const invested = solAmount - feeSol;
  const qty = invested / mark.priceSol;

  // the balance check IS the update — a concurrent buy cannot spend it twice
  const debited = (await sql`
    UPDATE runs SET cash_sol = cash_sol - ${solAmount}
    WHERE id = ${run.id} AND status = 'active' AND cash_sol >= ${solAmount - 1e-9}
    RETURNING id
  `) as Row[];
  if (debited.length === 0) throw new Error("insufficient balance");

  // avg_price_usd is the qty-weighted USD FILL price — pinned at buy time so
  // the entry marker never drifts with SOL/USD afterwards. Legacy rows
  // (usd = 0) seed from their sol average at today's ratio, once.
  await sql`
    INSERT INTO positions(run_id, mint, pair_address, symbol, name, image_url, qty, invested_sol, avg_price_sol, avg_price_usd)
    VALUES (${run.id}, ${mint}, ${mark.pairAddress}, ${mark.symbol}, ${mark.name},
            ${mark.imageUrl ?? null}, ${qty}, ${invested}, ${mark.priceSol}, ${mark.priceUsd})
    ON CONFLICT(run_id, mint) DO UPDATE SET
      qty = positions.qty + ${qty},
      invested_sol = positions.invested_sol + ${invested},
      avg_price_sol = (positions.invested_sol + ${invested}) / (positions.qty + ${qty}),
      avg_price_usd = (
        COALESCE(NULLIF(positions.avg_price_usd, 0), positions.avg_price_sol * ${mark.priceUsd / mark.priceSol}) * positions.qty
        + ${mark.priceUsd * qty}
      ) / (positions.qty + ${qty})
  `;
  await recordTrade(run, "buy", mark, qty, solAmount, feeSol, null);
}

export async function sell(wallet: string, mint: string, fraction: number): Promise<void> {
  let run = (await activeChallenge(wallet)) ?? (await activeFunded(wallet));
  if (!run) throw new Error("no active run");
  run = await settle(run);
  if (run.status !== "active") throw new Error("run is not active");

  const positions = await positionsOf(run.id);
  const pos = positions.find((p) => p.mint === mint);
  if (!pos) throw new Error("no position");
  const f = Math.min(1, Math.max(0, fraction));
  if (f <= 0) throw new Error("nothing to sell");

  const { marks } = await getMarks([mint]);
  const mark = marks[mint];
  if (!mark) throw new Error("no live market for this token");

  const qty = pos.qty * f;
  const gross = qty * mark.priceSol;
  const feeSol = gross * RULES.feeRate;
  const proceeds = gross - feeSol;
  const costBasis = pos.invested_sol * f;

  // decrement conditionally so a double-submit cannot sell the same tokens twice
  const sold = (await sql`
    UPDATE positions SET qty = qty - ${qty}, invested_sol = invested_sol - ${costBasis}
    WHERE run_id = ${run.id} AND mint = ${mint} AND qty >= ${qty - 1e-12}
    RETURNING qty
  `) as Row[];
  if (sold.length === 0) throw new Error("position changed — retry");

  if (Number(sold[0].qty) <= 1e-12) {
    await sql`DELETE FROM positions WHERE run_id = ${run.id} AND mint = ${mint}`;
  }
  await sql`UPDATE runs SET cash_sol = cash_sol + ${proceeds} WHERE id = ${run.id}`;
  await recordTrade(run, "sell", mark, qty, proceeds, feeSol, proceeds - costBasis);
}

/** liquidate + clear the phase; phase 3 opens the funded account */
export async function securePass(wallet: string): Promise<void> {
  let run = await activeChallenge(wallet);
  if (!run) throw new Error("no active challenge");
  run = await settle(run);
  if (run.status !== "active") throw new Error("run is not active");
  if (run.trade_count < RULES.minTrades) throw new Error("minimum fills not reached");

  const positions = await positionsOf(run.id);
  const { marks, solUsd } = await getMarks(positions.map((p) => p.mint));

  let cash = run.cash_sol;
  for (const p of positions) {
    const mark = marks[p.mint];
    const px = mark ? mark.priceSol : p.avg_price_sol;
    const gross = p.qty * px;
    const feeSol = gross * RULES.feeRate;
    cash += gross - feeSol;
  }
  const target = RULES.phases[run.phase].target;
  if (cash < target) throw new Error("target not reached");

  const cleared = run.phase >= RULES.phases.length - 1;
  // claim the phase transition exactly once
  const closed = (await sql`
    UPDATE runs SET status = ${cleared ? "funded" : "passed"}, cash_sol = ${cash}, ended_at = ${Date.now()}
    WHERE id = ${run.id} AND status = 'active'
    RETURNING id
  `) as Row[];
  if (closed.length === 0) throw new Error("run already settled");

  for (const p of positions) {
    const mark = marks[p.mint];
    if (mark) {
      const gross = p.qty * mark.priceSol;
      const feeSol = gross * RULES.feeRate;
      await recordTrade(run, "sell", mark, p.qty, gross - feeSol, feeSol, gross - feeSol - p.invested_sol);
    }
  }
  await sql`DELETE FROM positions WHERE run_id = ${run.id}`;

  const now = Date.now();
  if (!cleared) {
    await sql`
      INSERT INTO runs(wallet, kind, tier, phase, attempt, status, cash_sol, start_sol, started_at, ends_at)
      VALUES (${wallet}, 'challenge', ${run.tier}, ${run.phase + 1}, ${run.attempt}, 'active',
              ${RULES.startBalance}, ${RULES.startBalance}, ${now}, ${now + CHALLENGE_MS})
    `;
  } else {
    // cleared all three → a fixed cash PRIZE sent straight to the wallet.
    // No funded account, no profit split: the firm just pays the reward. One
    // prize per winning run, guarded by the run id so a replay can't double-pay.
    const prizeUsd =
      run.tier === "free" ? RULES.freeRewardUsd : RULES.entryFeeUsd * RULES.fundedMultiple;
    void solUsd;
    await sql`
      INSERT INTO withdrawals(wallet, run_id, profit_usd, payout_usd, status, requested_at, payable_at)
      SELECT ${wallet}, ${run.id}, ${prizeUsd}, ${prizeUsd}, 'pending', ${now}, ${now + 24 * 3600_000}
      WHERE NOT EXISTS (SELECT 1 FROM withdrawals WHERE run_id = ${run.id})
    `;
  }
}

/** deprecated: the funded-account withdrawal model is replaced by a fixed prize
 *  paid automatically on clearing challenge 3. Kept as a guarded no-op so the
 *  old route can't do anything. */
export async function requestWithdrawal(wallet: string) {
  void wallet;
  throw new Error("withdrawals are automatic now — the prize is sent on winning");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _legacyRequestWithdrawal(wallet: string) {
  let run = await activeFunded(wallet);
  if (!run) throw new Error("no funded account");
  run = await settle(run);
  if (run.status !== "active") throw new Error("funded account is closed");

  const pending = (await sql`
    SELECT COUNT(*)::int AS c FROM withdrawals WHERE wallet = ${wallet} AND status = 'pending'
  `) as Row[];
  if (Number(pending[0].c) > 0) throw new Error("a withdrawal is already pending");

  const positions = await positionsOf(run.id);
  const { solUsd } = await getMarks(positions.map((p) => p.mint));
  const usd = solUsd > 0 ? solUsd : 75;
  const withdrawableSol = Math.max(0, run.cash_sol - run.start_sol);
  const profitUsd = withdrawableSol * usd;
  if (profitUsd < 5) throw new Error("minimum withdrawal is $5 of realized profit");

  const payoutUsd = profitUsd * RULES.profitSplit;
  const now = Date.now();

  // deduct first, and only if the cash is really still there
  const deducted = (await sql`
    UPDATE runs SET cash_sol = cash_sol - ${withdrawableSol}
    WHERE id = ${run.id} AND status = 'active' AND cash_sol >= ${run.start_sol + withdrawableSol - 1e-9}
    RETURNING id
  `) as Row[];
  if (deducted.length === 0) throw new Error("balance changed — retry");

  await sql`
    INSERT INTO withdrawals(wallet, run_id, profit_usd, payout_usd, status, requested_at, payable_at)
    VALUES (${wallet}, ${run.id}, ${profitUsd}, ${payoutUsd}, 'pending', ${now}, ${now + 24 * 3600_000})
  `;
  return { profitUsd, payoutUsd };
}

/** everything the client needs to render, in one payload */
export async function clientState(wallet: string) {
  await ensureSchema();
  let challenge = await activeChallenge(wallet);
  if (challenge) challenge = await settle(challenge);
  let funded = await activeFunded(wallet);
  if (funded) funded = await settle(funded);

  const shown = challenge?.status === "active" ? challenge : funded?.status === "active" ? funded : undefined;
  const positions = shown ? await positionsOf(shown.id) : [];
  const { marks, solUsd } = await getMarks(positions.map((p) => p.mint));

  const historyRows = (await sql`
    SELECT * FROM runs WHERE wallet = ${wallet} AND status IN ('passed','failed','funded')
    ORDER BY id DESC LIMIT 30
  `) as Row[];
  const history = historyRows.map(toRun).map((r) => ({
    phase: r.phase + 1,
    attempt: r.attempt,
    finalEquity: r.cash_sol,
    trades: r.trade_count,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? r.started_at,
    outcome: r.status === "failed" ? ("failed" as const) : ("passed" as const),
    kind: r.kind,
  }));

  const tradeRows = shown
    ? ((await sql`
        SELECT * FROM trades WHERE run_id = ${shown.id} ORDER BY ts DESC LIMIT 120
      `) as Row[])
    : [];

  const withdrawals = (await sql`
    SELECT * FROM withdrawals WHERE wallet = ${wallet} ORDER BY id DESC LIMIT 20
  `) as Row[];

  const last = await lastChallenge(wallet);

  // the prize: set once the most recent run cleared all three challenges
  const won = last && last.status === "funded" ? last : undefined;
  const prizeRow = won ? withdrawals.find((w) => Number(w.run_id) === won.id) : undefined;
  const prize = won
    ? {
        usd: prizeRow
          ? Number(prizeRow.payout_usd)
          : won.tier === "free"
            ? RULES.freeRewardUsd
            : RULES.entryFeeUsd * RULES.fundedMultiple,
        status: (prizeRow?.status as string) ?? "pending",
        txSig: (prizeRow?.tx_sig as string) ?? null,
        tier: won.tier,
      }
    : null;

  return {
    wallet,
    prize,
    run: shown
      ? {
          kind: shown.kind,
          tier: shown.tier,
          phase: shown.phase,
          attempt: shown.attempt,
          status: shown.status,
          failReason: shown.fail_reason,
          cashSol: shown.cash_sol,
          startSol: shown.start_sol,
          principalUsd: shown.principal_usd,
          startedAt: shown.started_at,
          endsAt: shown.ends_at,
          tradeCount: shown.trade_count,
          equitySol: equityOf(shown, positions, marks),
        }
      : null,
    lastOutcome:
      !shown && last && last.status !== "active"
        ? {
            status: last.status,
            failReason: last.fail_reason,
            phase: last.phase,
            attempt: last.attempt,
            finalEquity: last.cash_sol,
          }
        : null,
    positions: positions.map((p) => ({
      mint: p.mint,
      pairAddress: p.pair_address,
      symbol: p.symbol,
      name: p.name,
      imageUrl: p.image_url ?? undefined,
      qty: p.qty,
      investedSol: p.invested_sol,
      avgPriceSol: p.avg_price_sol,
      avgPriceUsd: p.avg_price_usd,
    })),
    trades: tradeRows.map((t) => ({
      id: String(t.id),
      ts: Number(t.ts),
      side: t.side,
      mint: t.mint,
      symbol: t.symbol,
      qty: Number(t.qty),
      priceSol: Number(t.price_sol),
      solAmount: Number(t.sol_amount),
      feeSol: Number(t.fee_sol),
      pnlSol: t.pnl_sol === null ? undefined : Number(t.pnl_sol),
    })),
    withdrawals: withdrawals.map((w) => ({
      id: Number(w.id),
      payout_usd: Number(w.payout_usd),
      profit_usd: Number(w.profit_usd),
      status: w.status,
      requested_at: Number(w.requested_at),
      payable_at: Number(w.payable_at),
      tx_sig: w.tx_sig ?? null,
    })),
    history,
    solUsd,
  };
}
