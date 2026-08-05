// Single source of truth for every game rule and brand constant.
// The UI reads everything from here — change a number, the whole site follows.

export const BRAND = "GETFUNDED";
export const TAGLINE = "trade memecoins. get funded.";

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
