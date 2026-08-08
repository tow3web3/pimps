// Single source of truth for every game rule and brand constant.
// The UI reads everything from here — change a number, the whole site follows.

export const BRAND = "GETFUNDED";
export const TAGLINE = "trade memecoins. get funded.";

/** community links — paste the real URLs when live; empty strings keep the
    icons visible but pointing nowhere yet */
export const SOCIALS = {
  x: "https://x.com/getfundeddotfun",
  telegram: "https://t.me/getfundedfun",
};

export const RULES = {
  /** Virtual starting balance for every phase, in SOL */
  startBalance: 10,

  /** The three challenge phases — equity target in SOL */
  phases: [
    { num: 1, target: 15, gainLabel: "+50%" },
    { num: 2, target: 20, gainLabel: "+100%" },
    { num: 3, target: 30, gainLabel: "+200%" },
  ],

  /** Equity below this (SOL) at any moment = challenge failed (50% max drawdown) */
  failFloor: 5,

  /** Max share of current equity a single buy can bring one token to */
  maxExposure: 0.33,

  /** Simulated fee/spread charged on both sides of every fill (pump.fun charges 1% for real) */
  feeRate: 0.01,

  /** Minimum fills to qualify — stops one lucky all-in from passing */
  minTrades: 10,

  /** A token is buyable only if its market cap clears this (USD) */
  minMcapUsd: 100_000,

  /** Anti-fake floor: a $100K+ mcap doing less than this in real 24h volume
      is a painted cap, not a market — it generates no meaningful fees and
      its price can be walked around. Filtered out of the universe. */
  minVol24Usd: 50_000,

  /** Anti-manipulation heuristics — the rugger signature is an enormous
      mcap over a thin book: almost no liquidity AND almost no turnover
      relative to the cap. Either alone can be innocent; together they mean
      the price was walked up an empty book. */
  rug: {
    minLiqUsd: 15_000,
    /** suspect when liquidity < 1.5% of mcap… */
    minLiqToMcap: 0.015,
    /** …unless real turnover proves the market (vol24 ≥ 5% of mcap) */
    volRescueToMcap: 0.05,
    /** a token detonating right now leaves the buy list */
    maxCrash1h: -80,
  },

  /** And only if it was minted through pump.fun (mint address suffix check) */
  pumpSuffix: "pump",

  /** Days before an unfinished phase expires */
  challengeDays: 30,

  /** Smallest order the desk accepts, in SOL */
  minOrderSol: 0.05,

  /** Simulated entry fee (USD) and the funded account it unlocks (15x) */
  entryFeeUsd: 20,
  fundedMultiple: 15,
  /** Trader keeps this share of funded-account profits */
  profitSplit: 0.8,

  /** The free roll — same gauntlet, $0 entry, smaller funded account */
  freeRewardUsd: 50,

  /** The platform token — paying the entry with it earns the discount */
  token: {
    symbol: "GETFUNDED",
    name: "GetFunded token",
    discount: 0.25,
    /** paste the real mint address once the token is deployed */
    mint: "",
  },
} as const;

export const CHALLENGE_MS = RULES.challengeDays * 24 * 60 * 60 * 1000;

export const fundedAccountUsd = () => RULES.entryFeeUsd * RULES.fundedMultiple;

/** entry price when paid in DGN, after the holder discount */
export const entryFeeGfUsd = () => RULES.entryFeeUsd * (1 - RULES.token.discount);

/** the anti-manipulation gate — shared by the universe, the token list and
    the fill engine so no surface can disagree */
export function looksLegitMarket(t: {
  mcapUsd: number;
  liqUsd: number;
  vol24Usd?: number;
  chg1h?: number;
}): boolean {
  if (t.liqUsd < RULES.rug.minLiqUsd) return false;
  if ((t.chg1h ?? 0) <= RULES.rug.maxCrash1h) return false;
  const liqRatio = t.mcapUsd > 0 ? t.liqUsd / t.mcapUsd : 0;
  // legacy rows without volume data can't be judged on turnover — the
  // liquidity-ratio arm alone then decides
  const volRatio =
    t.mcapUsd > 0 && t.vol24Usd !== undefined ? t.vol24Usd / t.mcapUsd : Infinity;
  // painted cap: huge valuation, no depth AND no turnover
  if (liqRatio < RULES.rug.minLiqToMcap && volRatio < RULES.rug.volRescueToMcap) return false;
  return true;
}
