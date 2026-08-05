"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CHALLENGE_MS, RULES } from "./rules";
import type {
  EquityPoint,
  FailReason,
  GameStatus,
  PhaseResult,
  Position,
  TokenInfo,
  TradeRec,
} from "./types";

export interface TradeResult {
  ok: boolean;
  error?: string;
}

export interface FundedInfo {
  principalUsd: number;
  startSol: number;
  withdrawableUsd: number;
}

export interface WithdrawalRow {
  id: number;
  payout_usd: number;
  profit_usd: number;
  status: string;
  requested_at: number;
  payable_at: number;
  tx_sig: string | null;
}

/** shape of GET /api/game/state — the server is the source of truth */
export interface ServerStatePayload {
  run: {
    kind: "challenge" | "funded";
    tier: "free" | "paid";
    phase: number;
    attempt: number;
    status: string;
    cashSol: number;
    startSol: number;
    principalUsd: number | null;
    startedAt: number;
    endsAt: number | null;
    tradeCount: number;
    equitySol: number;
  } | null;
  lastOutcome: {
    status: string;
    failReason: string | null;
    phase: number;
    attempt: number;
    finalEquity: number;
  } | null;
  positions: Position[];
  trades: TradeRec[];
  withdrawals: WithdrawalRow[];
  history: Array<PhaseResult & { kind?: string }>;
  solUsd: number;
}

async function serverCall(path: string, body?: unknown): Promise<TradeResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j.error ?? "rejected by server" };
    if (j.state) useGame.getState().hydrateServer(j.state);
    return { ok: true };
  } catch {
    return { ok: false, error: "network error" };
  }
}

export type PayMethod = "usdc" | "gf" | "free";

export interface PaymentRec {
  method: PayMethod;
  amountUsd: number;
  ts: number;
  /** on-chain signature when the entry was paid for real */
  txSig?: string;
}

interface GameState {
  status: GameStatus;
  /** phase index 0..2 */
  phase: number;
  attempt: number;
  /** free roll pays the small funded account; paid track pays the full one */
  tier: "free" | "paid";
  lastPayment: PaymentRec | null;
  /** true once a wallet session mirrors the server game */
  serverMode: boolean;
  funded: FundedInfo | null;
  serverWithdrawals: WithdrawalRow[];
  cashSol: number;
  positions: Position[];
  trades: TradeRec[];
  startedAt: number;
  endsAt: number;
  /** last marked net-liquidation value (cash + positions, sell fee applied) */
  equity: number;
  peakEquity: number;
  equitySeries: EquityPoint[];
  failReason: FailReason | null;
  history: PhaseResult[];

  buy: (token: TokenInfo, solAmount: number) => TradeResult | Promise<TradeResult>;
  sell: (mint: string, fraction: number, priceSol: number) => TradeResult | Promise<TradeResult>;
  markToMarket: (prices: Record<string, { priceSol: number }>) => void;
  /** liquidate everything and clear the phase (only valid once target + min trades are met) */
  securePass: (prices: Record<string, { priceSol: number }>) => TradeResult | Promise<TradeResult>;
  hydrateServer: (payload: ServerStatePayload) => void;
  leaveServerMode: () => void;
  /** from the "passed" screen into the next phase */
  startNextPhase: () => void;
  /** after a fail — new attempt from phase 1 (simulated re-entry fee) */
  restart: () => void;
  resetAll: () => void;
  /** checkout completion — records the payment, sets the tier and (re)seats the trader */
  payEntry: (method: PayMethod, txSig?: string) => void;
}

const freshPhaseFields = () => ({
  cashSol: RULES.startBalance,
  positions: [] as Position[],
  trades: [] as TradeRec[],
  startedAt: Date.now(),
  endsAt: Date.now() + CHALLENGE_MS,
  equity: RULES.startBalance,
  peakEquity: RULES.startBalance,
  equitySeries: [{ t: Date.now(), v: RULES.startBalance }] as EquityPoint[],
  failReason: null as FailReason | null,
});

/** net liquidation value: cash + every position sold at market with the fee applied */
function computeEquity(
  cash: number,
  positions: Position[],
  prices: Record<string, { priceSol: number }>,
): number {
  let v = cash;
  for (const p of positions) {
    const px = prices[p.mint]?.priceSol ?? p.avgPriceSol;
    v += p.qty * px * (1 - RULES.feeRate);
  }
  return v;
}

let lastSeriesPush = 0;

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      status: "active",
      phase: 0,
      attempt: 1,
      tier: "paid",
      lastPayment: null,
      serverMode: false,
      funded: null,
      serverWithdrawals: [],
      ...freshPhaseFields(),
      history: [],

      buy: (token, solAmount) => {
        const s = get();
        if (s.serverMode) return serverCall("/api/game/buy", { mint: token.mint, solAmount });
        if (s.status !== "active") return { ok: false, error: "challenge is not active" };
        if (!token.priceSol || token.priceSol <= 0)
          return { ok: false, error: "no live price for this token" };
        if (token.mcapUsd < RULES.minMcapUsd)
          return { ok: false, error: `market cap below $${RULES.minMcapUsd / 1000}K floor` };
        if (solAmount < RULES.minOrderSol)
          return { ok: false, error: `min order is ${RULES.minOrderSol} SOL` };
        if (solAmount > s.cashSol + 1e-9) return { ok: false, error: "insufficient balance" };

        const existing = s.positions.find((p) => p.mint === token.mint);
        const posValue = existing ? existing.qty * token.priceSol : 0;
        const capSol = RULES.maxExposure * s.equity;
        if (posValue + solAmount > capSol + 1e-9)
          return {
            ok: false,
            error: `35% cap: max ${Math.max(0, capSol - posValue).toFixed(2)} SOL more on this token`,
          };

        const feeSol = solAmount * RULES.feeRate;
        const invested = solAmount - feeSol;
        const qty = invested / token.priceSol;

        const positions = existing
          ? s.positions.map((p) =>
              p.mint === token.mint
                ? {
                    ...p,
                    qty: p.qty + qty,
                    investedSol: p.investedSol + invested,
                    avgPriceSol: (p.investedSol + invested) / (p.qty + qty),
                    imageUrl: p.imageUrl ?? token.imageUrl,
                  }
                : p,
            )
          : [
              ...s.positions,
              {
                mint: token.mint,
                pairAddress: token.pairAddress,
                symbol: token.symbol,
                name: token.name,
                imageUrl: token.imageUrl,
                qty,
                investedSol: invested,
                avgPriceSol: token.priceSol,
              },
            ];

        const trade: TradeRec = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          side: "buy",
          mint: token.mint,
          symbol: token.symbol,
          solAmount,
          priceSol: token.priceSol,
          qty,
          feeSol,
        };

        set({
          cashSol: s.cashSol - solAmount,
          positions,
          trades: [trade, ...s.trades],
          equitySeries: [...s.equitySeries, { t: trade.ts, v: s.equity }].slice(-2880),
        });
        return { ok: true };
      },

      sell: (mint, fraction, priceSol) => {
        const s = get();
        if (s.serverMode) return serverCall("/api/game/sell", { mint, fraction });
        if (s.status !== "active") return { ok: false, error: "challenge is not active" };
        const pos = s.positions.find((p) => p.mint === mint);
        if (!pos) return { ok: false, error: "no position" };
        if (!priceSol || priceSol <= 0) return { ok: false, error: "no live price" };
        const f = Math.min(1, Math.max(0, fraction));
        if (f <= 0) return { ok: false, error: "nothing to sell" };

        const qty = pos.qty * f;
        const gross = qty * priceSol;
        const feeSol = gross * RULES.feeRate;
        const proceeds = gross - feeSol;
        const costBasis = pos.investedSol * f;
        const pnlSol = proceeds - costBasis;

        const positions =
          f >= 0.9999
            ? s.positions.filter((p) => p.mint !== mint)
            : s.positions.map((p) =>
                p.mint === mint
                  ? {
                      ...p,
                      qty: p.qty - qty,
                      investedSol: p.investedSol - costBasis,
                    }
                  : p,
              );

        const trade: TradeRec = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          side: "sell",
          mint,
          symbol: pos.symbol,
          solAmount: proceeds,
          priceSol,
          qty,
          feeSol,
          pnlSol,
        };

        set({
          cashSol: s.cashSol + proceeds,
          positions,
          trades: [trade, ...s.trades],
          equitySeries: [...s.equitySeries, { t: trade.ts, v: s.equity }].slice(-2880),
        });
        return { ok: true };
      },

      markToMarket: (prices) => {
        const s = get();
        if (s.status !== "active") return;
        const equity = computeEquity(s.cashSol, s.positions, prices);
        const peakEquity = Math.max(s.peakEquity, equity);

        // server mode: live display estimate only — pass/fail is the server's call
        if (s.serverMode) {
          set({ equity, peakEquity });
          return;
        }

        // clock expiry
        if (Date.now() > s.endsAt) {
          set({
            equity,
            peakEquity,
            status: "failed",
            failReason: "expired",
            history: [
              ...s.history,
              {
                phase: s.phase + 1,
                attempt: s.attempt,
                finalEquity: equity,
                trades: s.trades.length,
                startedAt: s.startedAt,
                endedAt: Date.now(),
                outcome: "failed",
              },
            ],
          });
          return;
        }

        // drawdown breach
        if (equity < RULES.failFloor) {
          set({
            equity,
            peakEquity,
            status: "failed",
            failReason: "drawdown",
            history: [
              ...s.history,
              {
                phase: s.phase + 1,
                attempt: s.attempt,
                finalEquity: equity,
                trades: s.trades.length,
                startedAt: s.startedAt,
                endedAt: Date.now(),
                outcome: "failed",
              },
            ],
          });
          return;
        }

        const now = Date.now();
        const series =
          now - lastSeriesPush > 30_000
            ? [...s.equitySeries, { t: now, v: equity }].slice(-2880)
            : s.equitySeries;
        if (series !== s.equitySeries) lastSeriesPush = now;
        set({ equity, peakEquity, equitySeries: series });
      },

      securePass: (prices) => {
        const s = get();
        if (s.serverMode) return serverCall("/api/game/securepass");
        if (s.status !== "active") return { ok: false, error: "not active" };
        if (s.trades.length < RULES.minTrades)
          return { ok: false, error: `need ${RULES.minTrades} trades minimum` };
        const equity = computeEquity(s.cashSol, s.positions, prices);
        const target = RULES.phases[s.phase].target;
        if (equity < target) return { ok: false, error: "target not reached" };

        // liquidate everything at market
        let cash = s.cashSol;
        const closes: TradeRec[] = [];
        for (const p of s.positions) {
          const px = prices[p.mint]?.priceSol ?? p.avgPriceSol;
          const gross = p.qty * px;
          const feeSol = gross * RULES.feeRate;
          cash += gross - feeSol;
          closes.push({
            id: crypto.randomUUID(),
            ts: Date.now(),
            side: "sell",
            mint: p.mint,
            symbol: p.symbol,
            solAmount: gross - feeSol,
            priceSol: px,
            qty: p.qty,
            feeSol,
            pnlSol: gross - feeSol - p.investedSol,
          });
        }

        set({
          cashSol: cash,
          positions: [],
          equity: cash,
          trades: [...closes, ...s.trades],
          status: s.phase >= RULES.phases.length - 1 ? "funded" : "passed",
          history: [
            ...s.history,
            {
              phase: s.phase + 1,
              attempt: s.attempt,
              finalEquity: cash,
              trades: s.trades.length + closes.length,
              startedAt: s.startedAt,
              endedAt: Date.now(),
              outcome: "passed",
            },
          ],
        });
        return { ok: true };
      },

      startNextPhase: () => {
        const s = get();
        if (s.status !== "passed") return;
        set({ status: "active", phase: s.phase + 1, ...freshPhaseFields() });
      },

      restart: () => {
        const s = get();
        if (s.status !== "failed") return;
        set({ status: "active", phase: 0, attempt: s.attempt + 1, ...freshPhaseFields() });
      },

      resetAll: () => {
        set({ status: "active", phase: 0, attempt: 1, history: [], ...freshPhaseFields() });
      },

      hydrateServer: (p) => {
        const s = get();
        const now = Date.now();
        const pushSeries = (v: number) => {
          if (now - lastSeriesPush < 30_000) return s.equitySeries;
          lastSeriesPush = now;
          return [...s.equitySeries, { t: now, v }].slice(-2880);
        };

        if (p.run) {
          const isFunded = p.run.kind === "funded";
          set({
            serverMode: true,
            status: "active",
            phase: isFunded ? RULES.phases.length - 1 : p.run.phase,
            attempt: p.run.attempt,
            tier: p.run.tier,
            cashSol: p.run.cashSol,
            equity: p.run.equitySol,
            peakEquity: Math.max(s.peakEquity, p.run.equitySol),
            positions: p.positions,
            trades: p.trades,
            startedAt: p.run.startedAt,
            endsAt: p.run.endsAt ?? now + CHALLENGE_MS,
            failReason: null,
            equitySeries: pushSeries(p.run.equitySol),
            funded: isFunded
              ? {
                  principalUsd: p.run.principalUsd ?? 0,
                  startSol: p.run.startSol,
                  withdrawableUsd:
                    Math.max(0, p.run.cashSol - p.run.startSol) * (p.solUsd || 75),
                }
              : null,
            serverWithdrawals: p.withdrawals ?? [],
            history: (p.history ?? []).filter((h) => h.kind !== "funded"),
          });
        } else if (p.lastOutcome && p.lastOutcome.status === "failed") {
          set({
            serverMode: true,
            status: "failed",
            failReason: (p.lastOutcome.failReason as FailReason) ?? "drawdown",
            equity: p.lastOutcome.finalEquity,
            phase: p.lastOutcome.phase,
            attempt: p.lastOutcome.attempt,
            positions: [],
            trades: [],
            funded: null,
            serverWithdrawals: p.withdrawals ?? [],
            history: (p.history ?? []).filter((h) => h.kind !== "funded"),
          });
        } else {
          set({
            serverMode: true,
            status: "unseated",
            positions: [],
            trades: [],
            cashSol: RULES.startBalance,
            equity: RULES.startBalance,
            funded: null,
            serverWithdrawals: p.withdrawals ?? [],
            history: (p.history ?? []).filter((h) => h.kind !== "funded"),
          });
        }
      },

      leaveServerMode: () => {
        set({
          serverMode: false,
          funded: null,
          serverWithdrawals: [],
          status: "active",
          phase: 0,
          attempt: 1,
          history: [],
          ...freshPhaseFields(),
        });
      },

      payEntry: (method, txSig) => {
        const s = get();
        const amountUsd =
          method === "free"
            ? 0
            : method === "gf"
              ? RULES.entryFeeUsd * (1 - RULES.token.discount)
              : RULES.entryFeeUsd;
        const lastPayment = { method, amountUsd, ts: Date.now(), txSig };
        const tier = method === "free" ? ("free" as const) : ("paid" as const);
        if (s.status === "failed") {
          set({
            status: "active",
            phase: 0,
            attempt: s.attempt + 1,
            tier,
            ...freshPhaseFields(),
            lastPayment,
          });
        } else if (s.status === "funded") {
          set({
            status: "active",
            phase: 0,
            attempt: 1,
            history: [],
            tier,
            ...freshPhaseFields(),
            lastPayment,
          });
        } else {
          set({ lastPayment, tier });
        }
      },
    }),
    {
      name: "getfunded-game-v1",
      // never persist the server mirror — guests keep their local game only
      partialize: (s) =>
        Object.fromEntries(
          Object.entries(s).filter(
            ([k]) => !["serverMode", "funded", "serverWithdrawals"].includes(k),
          ),
        ) as unknown as GameState,
    },
  ),
);

/** max SOL a buy on `mint` can still add under the 35% cap and available cash */
export function maxBuySol(
  cash: number,
  equity: number,
  positions: Position[],
  mint: string,
  priceSol: number,
): number {
  const pos = positions.find((p) => p.mint === mint);
  const posValue = pos ? pos.qty * priceSol : 0;
  const capRoom = RULES.maxExposure * equity - posValue;
  return Math.max(0, Math.min(cash, capRoom));
}
