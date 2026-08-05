// The authoritative game. Every rule the client displays is ENFORCED here:
// prices come from server-side marks, fills mutate SQLite, and the fail /
// pass decisions never depend on anything the browser sends.

import { db } from "./db";
import { getMarks, type Mark } from "./prices";
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

interface PosRow {
  run_id: number;
  mint: string;
  pair_address: string;
  symbol: string;
  name: string;
  image_url: string | null;
  qty: number;
  invested_sol: number;
  avg_price_sol: number;
}

const q = {
  activeRun: db.prepare(
    "SELECT * FROM runs WHERE wallet=? AND kind=? AND status='active' ORDER BY id DESC LIMIT 1",
  ),
  lastRun: db.prepare(
    "SELECT * FROM runs WHERE wallet=? AND kind='challenge' ORDER BY id DESC LIMIT 1",
  ),
  positions: db.prepare("SELECT * FROM positions WHERE run_id=?"),
  trades: db.prepare("SELECT * FROM trades WHERE run_id=? ORDER BY ts DESC LIMIT 120"),
  history: db.prepare(
    "SELECT * FROM runs WHERE wallet=? AND status IN ('passed','failed','funded') ORDER BY id DESC LIMIT 30",
  ),
  withdrawals: db.prepare("SELECT * FROM withdrawals WHERE wallet=? ORDER BY id DESC LIMIT 20"),
};

function positionsOf(runId: number): PosRow[] {
  return q.positions.all(runId) as PosRow[];
}

export function equityOf(run: RunRow, marks: Record<string, Mark>): number {
  let equity = run.cash_sol;
  for (const p of positionsOf(run.id)) {
    const mark = marks[p.mint];
    const px = mark ? mark.priceSol : p.avg_price_sol;
    equity += p.qty * px * (1 - RULES.feeRate);
  }
  return equity;
}

function failFloorOf(run: RunRow): number {
  // challenges: fixed floor from the rules; funded: 50% of the principal
  return run.kind === "challenge"
    ? (RULES.failFloor / RULES.startBalance) * run.start_sol
    : run.start_sol * 0.5;
}

function recordTrade(
  run: RunRow,
  side: "buy" | "sell",
  mark: Mark,
  qty: number,
  solAmount: number,
  feeSol: number,
  pnlSol: number | null,
) {
  db.prepare(
    "INSERT INTO trades(run_id, ts, side, mint, symbol, qty, price_sol, sol_amount, fee_sol, pnl_sol) VALUES(?,?,?,?,?,?,?,?,?,?)",
  ).run(run.id, Date.now(), side, mark.mint, mark.symbol, qty, mark.priceSol, solAmount, feeSol, pnlSol);
  db.prepare("UPDATE runs SET trade_count = trade_count + 1 WHERE id=?").run(run.id);
}

/** apply expiry + drawdown; returns updated status */
export async function settle(run: RunRow): Promise<RunRow> {
  if (run.status !== "active") return run;
  const positions = positionsOf(run.id);
  const { marks } = await getMarks(positions.map((p) => p.mint));
  const equity = equityOf(run, marks);

  if (run.kind === "challenge" && run.ends_at && Date.now() > run.ends_at) {
    db.prepare("UPDATE runs SET status='failed', fail_reason='expired', ended_at=? WHERE id=?").run(
      Date.now(),
      run.id,
    );
  } else if (equity < failFloorOf(run)) {
    db.prepare(
      "UPDATE runs SET status='failed', fail_reason='drawdown', ended_at=? WHERE id=?",
    ).run(Date.now(), run.id);
  }
  return q.activeRun.get(run.wallet, run.kind) as RunRow ?? { ...run, status: "failed" };
}

export function activeChallenge(wallet: string): RunRow | undefined {
  return q.activeRun.get(wallet, "challenge") as RunRow | undefined;
}
export function activeFunded(wallet: string): RunRow | undefined {
  return q.activeRun.get(wallet, "funded") as RunRow | undefined;
}

export function createChallengeRun(wallet: string, tier: "free" | "paid"): RunRow {
  const last = q.lastRun.get(wallet) as RunRow | undefined;
  if (last && last.status === "active") throw new Error("a run is already active");
  const attempt = last ? last.attempt + 1 : 1;
  const now = Date.now();
  const info = db
    .prepare(
      "INSERT INTO runs(wallet, kind, tier, phase, attempt, status, cash_sol, start_sol, started_at, ends_at) VALUES(?,?,?,0,?,'active',?,?,?,?)",
    )
    .run(wallet, "challenge", tier, attempt, RULES.startBalance, RULES.startBalance, now, now + CHALLENGE_MS);
  return db.prepare("SELECT * FROM runs WHERE id=?").get(info.lastInsertRowid) as RunRow;
}

export async function buy(wallet: string, mint: string, solAmount: number) {
  let run = activeChallenge(wallet) ?? activeFunded(wallet);
  if (!run) throw new Error("no active run — take a seat first");
  run = await settle(run);
  if (run.status !== "active") throw new Error("run is not active");

  const { marks } = await getMarks([mint, ...positionsOf(run.id).map((p) => p.mint)]);
  const mark = marks[mint];
  if (!mark) throw new Error("no live market for this token");
  if (!mint.toLowerCase().endsWith(RULES.pumpSuffix)) throw new Error("not a pump.fun token");
  if (mark.mcapUsd < RULES.minMcapUsd) throw new Error("market cap below the floor");
  if (mark.liqUsd < 15_000) throw new Error("pool liquidity below the floor");
  if (solAmount < RULES.minOrderSol) throw new Error("order below minimum");
  if (solAmount > run.cash_sol + 1e-9) throw new Error("insufficient balance");

  const equity = equityOf(run, marks);
  const pos = positionsOf(run.id).find((p) => p.mint === mint);
  const posValue = pos ? pos.qty * mark.priceSol : 0;
  if (posValue + solAmount > RULES.maxExposure * equity + 1e-9) {
    throw new Error(`${RULES.maxExposure * 100}% exposure cap exceeded`);
  }

  const feeSol = solAmount * RULES.feeRate;
  const invested = solAmount - feeSol;
  const qty = invested / mark.priceSol;

  const txn = db.transaction(() => {
    if (pos) {
      db.prepare(
        "UPDATE positions SET qty=qty+?, invested_sol=invested_sol+?, avg_price_sol=(invested_sol+?)/(qty+?) WHERE run_id=? AND mint=?",
      ).run(qty, invested, invested, qty, run.id, mint);
    } else {
      db.prepare(
        "INSERT INTO positions(run_id, mint, pair_address, symbol, name, image_url, qty, invested_sol, avg_price_sol) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(run.id, mint, mark.pairAddress, mark.symbol, mark.name, mark.imageUrl ?? null, qty, invested, mark.priceSol);
    }
    db.prepare("UPDATE runs SET cash_sol = cash_sol - ? WHERE id=?").run(solAmount, run.id);
    recordTrade(run, "buy", mark, qty, solAmount, feeSol, null);
  });
  txn();
}

export async function sell(wallet: string, mint: string, fraction: number) {
  let run = activeChallenge(wallet) ?? activeFunded(wallet);
  if (!run) throw new Error("no active run");
  run = await settle(run);
  if (run.status !== "active") throw new Error("run is not active");

  const pos = positionsOf(run.id).find((p) => p.mint === mint);
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

  const txn = db.transaction(() => {
    if (f >= 0.9999) {
      db.prepare("DELETE FROM positions WHERE run_id=? AND mint=?").run(run.id, mint);
    } else {
      db.prepare(
        "UPDATE positions SET qty=qty-?, invested_sol=invested_sol-? WHERE run_id=? AND mint=?",
      ).run(qty, costBasis, run.id, mint);
    }
    db.prepare("UPDATE runs SET cash_sol = cash_sol + ? WHERE id=?").run(proceeds, run.id);
    recordTrade(run, "sell", mark, qty, proceeds, feeSol, proceeds - costBasis);
  });
  txn();
}

/** liquidate + clear the phase; phase 3 opens the funded account */
export async function securePass(wallet: string) {
  let run = activeChallenge(wallet);
  if (!run) throw new Error("no active challenge");
  run = await settle(run);
  if (run.status !== "active") throw new Error("run is not active");
  if (run.trade_count < RULES.minTrades) throw new Error("minimum fills not reached");

  const positions = positionsOf(run.id);
  const { marks, solUsd } = await getMarks(positions.map((p) => p.mint));

  const txn = db.transaction(() => {
    let cash = run.cash_sol;
    for (const p of positions) {
      const mark = marks[p.mint];
      const px = mark ? mark.priceSol : p.avg_price_sol;
      const gross = p.qty * px;
      const feeSol = gross * RULES.feeRate;
      cash += gross - feeSol;
      if (mark) recordTrade(run, "sell", mark, p.qty, gross - feeSol, feeSol, gross - feeSol - p.invested_sol);
      db.prepare("DELETE FROM positions WHERE run_id=? AND mint=?").run(run.id, p.mint);
    }
    const target = RULES.phases[run.phase].target;
    if (cash < target) throw new Error("target not reached");

    const cleared = run.phase >= RULES.phases.length - 1;
    db.prepare("UPDATE runs SET status=?, cash_sol=?, ended_at=? WHERE id=?").run(
      cleared ? "funded" : "passed",
      cash,
      Date.now(),
      run.id,
    );

    if (!cleared) {
      const now = Date.now();
      db.prepare(
        "INSERT INTO runs(wallet, kind, tier, phase, attempt, status, cash_sol, start_sol, started_at, ends_at) VALUES(?,?,?,?,?,'active',?,?,?,?)",
      ).run(wallet, "challenge", run.tier, run.phase + 1, run.attempt, RULES.startBalance, RULES.startBalance, now, now + CHALLENGE_MS);
    } else {
      // the funded account: OUR capital, simulated, profits withdrawable 80/20
      const principalUsd =
        run.tier === "free" ? RULES.freeRewardUsd : RULES.entryFeeUsd * RULES.fundedMultiple;
      const startSol = solUsd > 0 ? principalUsd / solUsd : principalUsd / 75;
      db.prepare(
        "INSERT INTO runs(wallet, kind, tier, phase, attempt, status, cash_sol, start_sol, principal_usd, started_at) VALUES(?,?,?,0,1,'active',?,?,?,?)",
      ).run(wallet, "funded", run.tier, startSol, startSol, principalUsd, Date.now());
    }
  });
  txn();
}

/** realized cash above the funded principal → withdrawal (after the split) */
export async function requestWithdrawal(wallet: string) {
  let run = activeFunded(wallet);
  if (!run) throw new Error("no funded account");
  run = await settle(run);
  if (run.status !== "active") throw new Error("funded account is closed");

  const pending = db
    .prepare("SELECT COUNT(*) c FROM withdrawals WHERE wallet=? AND status='pending'")
    .get(wallet) as { c: number };
  if (pending.c > 0) throw new Error("a withdrawal is already pending");

  const { solUsd } = await getMarks(positionsOf(run.id).map((p) => p.mint));
  const usd = solUsd > 0 ? solUsd : 75;
  const withdrawableSol = Math.max(0, run.cash_sol - run.start_sol);
  const profitUsd = withdrawableSol * usd;
  if (profitUsd < 5) throw new Error("minimum withdrawal is $5 of realized profit");

  const payoutUsd = profitUsd * RULES.profitSplit;
  const now = Date.now();
  const txn = db.transaction(() => {
    db.prepare("UPDATE runs SET cash_sol = cash_sol - ? WHERE id=?").run(withdrawableSol, run.id);
    db.prepare(
      "INSERT INTO withdrawals(wallet, run_id, profit_usd, payout_usd, status, requested_at, payable_at) VALUES(?,?,?,?,'pending',?,?)",
    ).run(wallet, run.id, profitUsd, payoutUsd, now, now + 24 * 3600_000);
  });
  txn();
  return { profitUsd, payoutUsd };
}

/** everything the client needs to render, in one payload */
export async function clientState(wallet: string) {
  let challenge = activeChallenge(wallet);
  if (challenge) challenge = await settle(challenge);
  let funded = activeFunded(wallet);
  if (funded) funded = await settle(funded);

  const run = challenge?.status === "active" ? challenge : undefined;
  const shown = run ?? funded;
  const positions = shown ? positionsOf(shown.id) : [];
  const { marks, solUsd } = await getMarks(positions.map((p) => p.mint));

  const history = (q.history.all(wallet) as RunRow[]).map((r) => ({
    phase: r.phase + 1,
    attempt: r.attempt,
    finalEquity: r.cash_sol,
    trades: r.trade_count,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? r.started_at,
    outcome: r.status === "failed" ? ("failed" as const) : ("passed" as const),
    kind: r.kind,
  }));

  const lastChallenge = q.lastRun.get(wallet) as RunRow | undefined;

  return {
    wallet,
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
          equitySol: shown ? equityOf(shown, marks) : 0,
        }
      : null,
    lastOutcome:
      !shown && lastChallenge && lastChallenge.status !== "active"
        ? {
            status: lastChallenge.status,
            failReason: lastChallenge.fail_reason,
            phase: lastChallenge.phase,
            attempt: lastChallenge.attempt,
            finalEquity: lastChallenge.cash_sol,
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
    })),
    trades: shown
      ? (q.trades.all(shown.id) as Array<Record<string, unknown>>).map((t) => ({
          id: String(t.id),
          ts: t.ts,
          side: t.side,
          mint: t.mint,
          symbol: t.symbol,
          qty: t.qty,
          priceSol: t.price_sol,
          solAmount: t.sol_amount,
          feeSol: t.fee_sol,
          pnlSol: t.pnl_sol ?? undefined,
        }))
      : [],
    withdrawals: q.withdrawals.all(wallet),
    history,
    solUsd,
  };
}
