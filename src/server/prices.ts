// Authoritative marks for server-side fills — the client never supplies a price.
// DexScreener tokens/v1, deepest SOL pool per mint, 2s cache.

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
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  info?: { imageUrl?: string };
}

let cache: { at: number; key: string; marks: Record<string, Mark>; solUsd: number } | null = null;

export async function getMarks(
  mints: string[],
): Promise<{ marks: Record<string, Mark>; solUsd: number }> {
  const unique = [...new Set(mints)].sort();
  if (unique.length === 0) return { marks: {}, solUsd: cache?.solUsd ?? 0 };
  const key = unique.join(",");
  if (cache && cache.key === key && Date.now() - cache.at < 2_000) {
    return { marks: cache.marks, solUsd: cache.solUsd };
  }

  const marks: Record<string, Mark> = {};
  let solUsd = cache?.solUsd ?? 0;

  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
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
      };
      solUsd = priceUsd / priceSol;
    }
  }

  cache = { at: Date.now(), key, marks, solUsd };
  return { marks, solUsd };
}
