// Shared shapes between the data layer, the store and the UI.

/** Live market snapshot for one token (quote pool = deepest SOL pool) */
export interface TokenInfo {
  mint: string;
  pairAddress: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  /** price of one token in SOL */
  priceSol: number;
  priceUsd: number;
  mcapUsd: number;
  liqUsd: number;
  vol24Usd: number;
  chg5m: number;
  chg1h: number;
  chg24h: number;
  /** hours since the pool was created — 0 when unknown */
  ageHours?: number;
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Position {
  mint: string;
  pairAddress: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  /** token quantity held */
  qty: number;
  /** total SOL spent to build the position (after fees) */
  investedSol: number;
  /** volume-weighted average entry price, SOL per token */
  avgPriceSol: number;
}

export interface TradeRec {
  id: string;
  ts: number;
  side: "buy" | "sell";
  mint: string;
  symbol: string;
  /** SOL moved (spent on buy / received on sell, fee included in the delta) */
  solAmount: number;
  /** fill price, SOL per token */
  priceSol: number;
  qty: number;
  feeSol: number;
  /** realized PnL in SOL — sells only */
  pnlSol?: number;
}

export interface EquityPoint {
  t: number;
  v: number;
}

export type GameStatus =
  | "active" // trading the current phase
  | "passed" // phase cleared, waiting on the next-phase screen
  | "failed" // drawdown breached or clock expired
  | "funded"; // all three phases cleared

export type FailReason = "drawdown" | "expired";

export interface PhaseResult {
  phase: number;
  attempt: number;
  finalEquity: number;
  trades: number;
  startedAt: number;
  endedAt: number;
  outcome: "passed" | "failed";
}
