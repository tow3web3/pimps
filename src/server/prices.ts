// Authoritative marks for server-side fills — the client never supplies a price.
// DexScreener tokens/v1, deepest SOL pool per mint.
//
// Two precision tiers:
//   - equity / drawdown checks may reuse a mark up to 1s old (the hub cadence)
//   - FILLS pass { fresh: true } and always hit DexScreener live — an order
//     never executes on a cached price, whatever its age

const WSOL = "So11111111111111111111111111111111111111112";

export interface Mark {
  mint: string;
  pairAddress: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  priceSol: number;
  priceUsd: number;
  mcapUsd: number;
  liqUsd: number;
  vol24Usd?: number;
  chg1h?: number;
}

interface DsPair {
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string };
  priceNative: string;
  priceUsd: string;
  volume?: { h24?: number };
  priceChange?: { h1?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  info?: { imageUrl?: string };
}

// per-mint cache so a portfolio of 5 tokens doesn't refetch all 5 because one
// changed — and so a fresh fill for one mint can coexist with cached equity marks
const TTL = 1_000;
const cache = new Map<string, { at: number; mark: Mark }>();
let solUsdCache = 0;

async function fetchMarks(mints: string[]): Promise<Record<string, Mark>> {
  const marks: Record<string, Mark> = {};
  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) continue;
    const pairs = (await res.json()) as DsPair[];
    if (!Array.isArray(pairs)) continue;

    for (const p of pairs) {
      if (p.quoteToken.address !== WSOL) continue;
      const priceSol = Number(p.priceNative);
      const priceUsd = Number(p.priceUsd);
      if (priceSol <= 0 || priceUsd <= 0) continue;
      const liq = p.liquidity?.usd ?? 0;
      const cur = marks[p.baseToken.address];
      if (cur && cur.liqUsd >= liq) continue;
      marks[p.baseToken.address] = {
        mint: p.baseToken.address,
        pairAddress: p.pairAddress,
        symbol: p.baseToken.symbol,
        name: p.baseToken.name,
        imageUrl: p.info?.imageUrl,
        priceSol,
        priceUsd,
        mcapUsd: p.marketCap ?? p.fdv ?? 0,
        liqUsd: liq,
        // the anti-manipulation gate needs these at fill time — without them
        // it fails open and a painted cap could slip through the buy check
        vol24Usd: p.volume?.h24 ?? 0,
        chg1h: p.priceChange?.h1 ?? 0,
      };
      solUsdCache = priceUsd / priceSol;
    }
  }
  return marks;
}

export async function getMarks(
  mints: string[],
  opts?: { fresh?: boolean },
): Promise<{ marks: Record<string, Mark>; solUsd: number }> {
  const unique = [...new Set(mints)];
  if (unique.length === 0) return { marks: {}, solUsd: solUsdCache };

  const now = Date.now();
  const marks: Record<string, Mark> = {};
  const missing: string[] = [];
  for (const m of unique) {
    const hit = cache.get(m);
    if (!opts?.fresh && hit && now - hit.at < TTL) marks[m] = hit.mark;
    else missing.push(m);
  }

  if (missing.length > 0) {
    const fetched = await fetchMarks(missing);
    const at = Date.now();
    for (const [mint, mark] of Object.entries(fetched)) {
      marks[mint] = mark;
      cache.set(mint, { at, mark });
    }
    // a mint DS knows nothing about must not poison later requests
    if (cache.size > 500) {
      for (const [k, v] of cache) {
        if (Date.now() - v.at > TTL) cache.delete(k);
      }
    }
  }

  return { marks, solUsd: solUsdCache };
}
