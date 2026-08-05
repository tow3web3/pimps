import { NextRequest, NextResponse } from "next/server";
import type { TokenInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

const WSOL = "So11111111111111111111111111111111111111112";

// short server-side cache so many clients don't multiply DexScreener calls.
// with Helius active, DexScreener only refreshes metadata (mcap/liq/vol) and
// can be cached longer — Helius supplies the fast price ticks on every call.
let cache: { at: number; key: string; body: { tokens: TokenInfo[]; solUsd: number } } | null = null;

/**
 * Helius DAS price overlay — active as soon as HELIUS_API_KEY is set in .env.local.
 * One getAssetBatch call prices every mint (plus WSOL for the SOL/USD leg).
 */
async function heliusPrices(
  mints: string[],
): Promise<{ prices: Record<string, number>; solUsd: number } | null> {
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
    let solUsd = 0;
    for (const a of json?.result ?? []) {
      const p = a?.token_info?.price_info?.price_per_token;
      if (!a?.id || typeof p !== "number" || p <= 0) continue;
      if (a.id === WSOL) solUsd = p;
      else prices[a.id] = p;
    }
    if (solUsd <= 0 || Object.keys(prices).length === 0) return null;
    return { prices, solUsd };
  } catch {
    return null;
  }
}

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

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("pairs") ?? "";
  const pairs = raw
    .split(",")
    .filter((p) => /^[A-Za-z0-9]{30,50}$/.test(p))
    .slice(0, 30);
  if (pairs.length === 0) return NextResponse.json({ tokens: [], solUsd: 0 });

  const heliusOn = !!process.env.HELIUS_API_KEY;
  const key = pairs.join(",");
  const dsTtl = heliusOn ? 10_000 : 2_000;

  let tokens: TokenInfo[];
  let solUsd: number;

  if (cache && cache.key === key && Date.now() - cache.at < dsTtl) {
    tokens = cache.body.tokens.map((t) => ({ ...t }));
    solUsd = cache.body.solUsd;
  } else {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${key}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return NextResponse.json({ tokens: [], solUsd: 0 }, { status: 502 });
    const json = await res.json();
    const dsPairs: DsPair[] = json?.pairs ?? [];

    solUsd = 0;
    let bestLiq = 0;
    tokens = [];
    for (const p of dsPairs) {
      const priceSol = Number(p.priceNative);
      const priceUsd = Number(p.priceUsd);
      if (!priceSol || !priceUsd) continue;
      const liq = p.liquidity?.usd ?? 0;
      if (liq > bestLiq) {
        bestLiq = liq;
        solUsd = priceUsd / priceSol;
      }
      tokens.push({
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
      });
    }
    cache = { at: Date.now(), key, body: { tokens: tokens.map((t) => ({ ...t })), solUsd } };
  }

  // fast-lane price overlay when the Helius key is present
  let source: "helius" | "dexscreener" = "dexscreener";
  if (heliusOn && tokens.length > 0) {
    const h = await heliusPrices(tokens.map((t) => t.mint));
    if (h) {
      source = "helius";
      solUsd = h.solUsd;
      for (const t of tokens) {
        const usd = h.prices[t.mint];
        if (usd && usd > 0) {
          t.priceUsd = usd;
          t.priceSol = usd / h.solUsd;
        }
      }
    }
  }

  return NextResponse.json({ tokens, solUsd, source });
}
