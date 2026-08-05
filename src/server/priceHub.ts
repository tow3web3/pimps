// ONE price loader for the whole site. Clients never trigger an upstream call:
// they read from this in-memory store and register interest. A single server
// loop refreshes the most-wanted pairs. 1 visitor or 1000 = the same API cost.

import { recordTick } from "./candles";
import type { TokenInfo } from "@/lib/types";

const WSOL = "So11111111111111111111111111111111111111112";
const MAX_HOT = 30; // DexScreener batch limit
const INTERVAL_MS = 3_000;

const store = new Map<string, TokenInfo>(); // by pairAddress
const wanted = new Map<string, number>(); // pairAddress -> last requested at
let solUsd = 0;
let source: "helius" | "dexscreener" = "dexscreener";
let loop: ReturnType<typeof setInterval> | null = null;

interface DsPair {
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  volume?: { h24?: number };
  priceChange?: { m5?: number; h1?: number; h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  info?: { imageUrl?: string };
}

async function heliusOverlay(mints: string[]): Promise<{ prices: Record<string, number>; solUsd: number } | null> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "px",
        method: "getAssetBatch",
        params: { ids: [...mints, WSOL] },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const prices: Record<string, number> = {};
    let sol = 0;
    for (const a of json?.result ?? []) {
      const p = a?.token_info?.price_info?.price_per_token;
      if (!a?.id || typeof p !== "number" || p <= 0) continue;
      if (a.id === WSOL) sol = p;
      else prices[a.id] = p;
    }
    if (sol <= 0 || Object.keys(prices).length === 0) return null;
    return { prices, solUsd: sol };
  } catch {
    return null;
  }
}

async function refresh() {
  // the hot set: pairs asked for most recently, capped at one batch
  const now = Date.now();
  for (const [pair, at] of wanted) if (now - at > 5 * 60_000) wanted.delete(pair);
  const hot = [...wanted.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_HOT)
    .map(([pair]) => pair);
  if (hot.length === 0) return;

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${hot.join(",")}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return;
    const json = await res.json();
    const pairs: DsPair[] = json?.pairs ?? [];
    let bestLiq = 0;

    const fresh: TokenInfo[] = [];
    for (const p of pairs) {
      const priceSol = Number(p.priceNative);
      const priceUsd = Number(p.priceUsd);
      if (!priceSol || !priceUsd) continue;
      const liq = p.liquidity?.usd ?? 0;
      if (liq > bestLiq) {
        bestLiq = liq;
        solUsd = priceUsd / priceSol;
      }
      const info: TokenInfo = {
        mint: p.baseToken.address,
        pairAddress: p.pairAddress,
        symbol: p.baseToken.symbol,
        name: p.baseToken.name,
        imageUrl: p.info?.imageUrl,
        priceSol,
        priceUsd,
        mcapUsd: p.marketCap ?? p.fdv ?? 0,
        liqUsd: liq,
        vol24Usd: p.volume?.h24 ?? 0,
        chg5m: p.priceChange?.m5 ?? 0,
        chg1h: p.priceChange?.h1 ?? 0,
        chg24h: p.priceChange?.h24 ?? 0,
      };
      fresh.push(info);
    }

    const h = await heliusOverlay(fresh.map((t) => t.mint));
    if (h) {
      source = "helius";
      solUsd = h.solUsd;
      for (const t of fresh) {
        const usd = h.prices[t.mint];
        if (usd > 0) {
          t.priceUsd = usd;
          t.priceSol = usd / h.solUsd;
        }
      }
    } else {
      source = "dexscreener";
    }

    for (const t of fresh) {
      store.set(t.pairAddress, t);
      try {
        recordTick(t.pairAddress, t.priceUsd);
      } catch {
        /* candles must never break the feed */
      }
    }
  } catch {
    /* keep serving the last known marks */
  }
}

function ensureLoop() {
  if (loop) return;
  void refresh();
  loop = setInterval(() => void refresh(), INTERVAL_MS);
}

/** register interest and read whatever the hub already knows — no upstream call */
export function getPrices(pairs: string[]): {
  tokens: TokenInfo[];
  solUsd: number;
  source: "helius" | "dexscreener";
} {
  ensureLoop();
  const now = Date.now();
  const tokens: TokenInfo[] = [];
  for (const p of pairs) {
    wanted.set(p, now);
    const t = store.get(p);
    if (t) tokens.push(t);
  }
  return { tokens, solUsd, source };
}

/** seed the hub so the first visitor already has marks */
export function seedPairs(pairs: string[]) {
  const now = Date.now();
  for (const p of pairs.slice(0, MAX_HOT)) {
    if (!wanted.has(p)) wanted.set(p, now - 60_000); // lower priority than live views
  }
  ensureLoop();
}
