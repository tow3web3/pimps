// Simulated cohort for the preview build. Deterministic per wall-clock bucket
// (seeded random walks), so every visitor sees the same board and rows glide
// smoothly instead of teleporting. The real player's run is inserted among them.
// When the real backend lands, this module is replaced by an API call.

import { RULES } from "./rules";

export interface BoardRow {
  name: string;
  phase: number; // 1..3
  returnPct: number;
  trades: number;
  status: "live" | "cleared" | "failed";
  isYou?: boolean;
  hue: number; // avatar color
}

const NAMES = [
  "0xRugproof", "jeetslayer", "sol_maxi", "ape_theorem", "wagmi_wojak",
  "exit_liquidity", "gigachad.sol", "fomo_fighter", "candle_sniffer", "pnl_goblin",
  "moon_janitor", "dip_merchant", "sandwich_victim", "bags_secured", "delulu_trader",
  "mcap_watcher", "rugged_again", "green_wick", "copium_dealer", "ath_chaser",
  "floor_inspector", "degen_intern", "size_lord", "paper_hands", "diamond_dave",
  "entry_wizard", "chart_monk", "liq_hunter", "vibe_trader", "last_candle",
] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUCKET_MS = 5 * 60 * 1000;

/** cumulative walk value after n steps for a given bot — deterministic */
function walkAt(botSeed: number, steps: number, vol: number, cap: number): {
  value: number;
  peak: number;
  trough: number;
} {
  const rnd = mulberry32(botSeed);
  let v = 0;
  let peak = 0;
  let trough = 0;
  for (let i = 0; i < steps; i++) {
    // slight negative drift — the house edge every prop firm lives on
    v += (rnd() - 0.53) * vol;
    if (v > cap) v = cap;
    if (v > peak) peak = v;
    if (v < trough) trough = v;
  }
  return { value: v, peak, trough };
}

export function buildBoard(now: number): BoardRow[] {
  const bucket = Math.floor(now / BUCKET_MS);
  const frac = (now % BUCKET_MS) / BUCKET_MS;
  const failAt = -(1 - RULES.failFloor / RULES.startBalance) * 100 + 0.2; // -24.8

  return NAMES.map((name) => {
    const h = hash(name);
    const rnd = mulberry32(h);
    const phase = rnd() < 0.55 ? 1 : rnd() < 0.75 ? 2 : 3;
    const target = (RULES.phases[phase - 1].target / RULES.startBalance - 1) * 100;
    const vol = 0.8 + rnd() * 2.6;
    const joined = 6 + Math.floor(rnd() * 190); // buckets ago
    const steps = Math.min(joined, Math.max(1, joined - 0));

    const cap = target + 2;
    const a = walkAt(h ^ 0x9e3779b9, Math.min(steps, bucket % 1_000_000), vol, cap);
    const b = walkAt(h ^ 0x9e3779b9, Math.min(steps + 1, (bucket % 1_000_000) + 1), vol, cap);

    // smooth glide between buckets
    let ret = a.value + (b.value - a.value) * frac;
    let status: BoardRow["status"] = "live";

    if (a.trough <= failAt) {
      status = "failed";
      ret = failAt - 0.3 - (h % 40) / 10; // frozen somewhere past the floor
    } else if (a.peak >= target) {
      status = "cleared";
      ret = target + (h % 30) / 10;
    }

    return {
      name,
      phase,
      returnPct: ret,
      trades: RULES.minTrades + (h % 38),
      status,
      hue: h % 360,
    };
  });
}

export function insertYou(
  rows: BoardRow[],
  you: { returnPct: number; phase: number; trades: number; status: BoardRow["status"] },
): BoardRow[] {
  const all = [
    ...rows,
    { name: "you", isYou: true, hue: 190, ...you },
  ];
  return all.sort((x, y) => y.returnPct - x.returnPct);
}
