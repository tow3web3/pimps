import { NextResponse } from "next/server";
import { RULES } from "@/lib/rules";
import { db } from "@/server/db";
import { replaceEligible } from "@/server/eligibility";
import { seedPairs } from "@/server/priceHub";
import type { TokenInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

const WSOL = "So11111111111111111111111111111111111111112";
const GT = "https://api.geckoterminal.com/api/v2";
const PF = "https://frontend-api-v3.pump.fun";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// ── universe strategy ────────────────────────────────────────────────────
// PRIMARY: pump.fun's own listing sorted by market cap — the authoritative
// "every pump.fun token above the floor", refreshed each sweep — enriched
// with live pool data (price/liquidity/volume) from DexScreener in batches.
// FALLBACK: the GeckoTerminal rotation, for the day the unofficial API breaks.
// Results merge into a ROLLING UNION: partial sweeps grow the universe, and a
// token only leaves after 30min unseen. Rate limits degrade freshness, never
// the terminal.
const TTL = 90_000;
const UNSEEN_EXPIRY = 30 * 60_000;
// measured 2026-08-05: ~1050 pump.fun mints sit above the $100K floor —
// the cap must stay comfortably above the real population
const MAX_TOKENS = 1200;

let cache: { at: number; body: { tokens: TokenInfo[]; solUsd: number } } | null = null;
let inflight: Promise<{ tokens: TokenInfo[]; solUsd: number }> | null = null;
const seen = new Map<string, { info: TokenInfo; reserve: number; lastSeen: number }>();
let lastSolUsd = 0;
let rotation = 0;

// ── restart resilience: the last good universe is persisted and reloaded, so
// a reboot serves tokens instantly instead of an empty "scanning" terminal ──
try {
  const row = db.prepare("SELECT value FROM kv WHERE key='universe'").get() as
    | { value: string }
    | undefined;
  if (row) {
    const snap = JSON.parse(row.value) as { tokens: TokenInfo[]; solUsd: number };
    const now = Date.now();
    for (const t of snap.tokens ?? []) {
      seen.set(t.mint, { info: t, reserve: t.liqUsd, lastSeen: now });
    }
    lastSolUsd = snap.solUsd ?? 0;
    if (snap.tokens?.length) {
      replaceEligible(snap.tokens.map((t) => t.mint));
      cache = { at: 0, body: { tokens: snap.tokens, solUsd: lastSolUsd } };
      seedPairs(snap.tokens.slice(0, 30).map((t) => t.pairAddress));
      console.log(`[tokens] restored ${snap.tokens.length} tokens from the last snapshot`);
    }
  }
} catch {
  /* cold start with no snapshot — the first sweep fills it */
}

const saveSnapshot = db.prepare(
  "INSERT INTO kv(key, value, updated_at) VALUES('universe', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mergeInfo(info: TokenInfo, reserve: number) {
  const now = Date.now();
  const prev = seen.get(info.mint);
  if (prev && prev.reserve > reserve && now - prev.lastSeen < UNSEEN_EXPIRY) {
    // keep the deepest known pool as the pricing pool, refresh market numbers
    seen.set(info.mint, {
      info: { ...info, pairAddress: prev.info.pairAddress, liqUsd: prev.info.liqUsd },
      reserve: prev.reserve,
      lastSeen: now,
    });
  } else {
    seen.set(info.mint, { info, reserve, lastSeen: now });
  }
}

function buildUniverse(): { tokens: TokenInfo[]; solUsd: number } {
  const now = Date.now();
  for (const [mint, v] of seen) {
    if (now - v.lastSeen > UNSEEN_EXPIRY) seen.delete(mint);
  }
  const tokens = [...seen.values()]
    .map((x) => x.info)
    .sort((x, y) => y.vol24Usd - x.vol24Usd)
    .slice(0, MAX_TOKENS);
  replaceEligible(tokens.map((t) => t.mint));
  if (tokens.length > 0) {
    seedPairs(tokens.slice(0, 30).map((t) => t.pairAddress));
    try {
      saveSnapshot.run(JSON.stringify({ tokens, solUsd: lastSolUsd }), Date.now());
    } catch {
      /* snapshot is an optimisation, never a failure path */
    }
  }
  return { tokens, solUsd: lastSolUsd };
}

// ── primary: pump.fun listing + dexscreener enrichment ───────────────────

interface PfCoin {
  mint: string;
  name: string;
  symbol: string;
  image_uri?: string;
  usd_market_cap?: number;
  created_timestamp?: number;
}

async function pumpfunPage(offset: number, sort = "market_cap"): Promise<PfCoin[]> {
  const res = await fetch(
    `${PF}/coins?offset=${offset}&limit=50&sort=${sort}&order=DESC&includeNsfw=false`,
    { cache: "no-store", headers: { accept: "application/json", "user-agent": UA } },
  );
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? (json as PfCoin[]) : [];
}

interface DsPair {
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string };
  priceNative: string;
  priceUsd: string;
  volume?: { h24?: number };
  priceChange?: { m5?: number; h1?: number; h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

async function dsTokenPairs(mints: string[]): Promise<DsPair[]> {
  const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mints.join(",")}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? (json as DsPair[]) : [];
}

// NOTE: no mint-suffix filter here — pre-2024 pump.fun mints (MOODENG,
// ZEREBRO, TROLL, …) don't carry the "pump" suffix; being in pump.fun's own
// listing IS the provenance proof. The suffix check only guards the
// GeckoTerminal fallback, where provenance is otherwise unknown.

/** full walk of the mcap-sorted listing — the expensive, exhaustive sweep */
async function sweepPumpfun(): Promise<number> {
  const coins: PfCoin[] = [];
  for (let offset = 0; offset < 4000; offset += 50) {
    const page = await pumpfunPage(offset);
    if (page.length === 0) break;
    for (const c of page) {
      if ((c.usd_market_cap ?? 0) >= RULES.minMcapUsd && c.mint) coins.push(c);
    }
    const tail = page[page.length - 1];
    if ((tail?.usd_market_cap ?? 0) < RULES.minMcapUsd) break;
    await sleep(300);
  }
  return enrichAndMerge(coins);
}

/** cheap 90s probe: the newest coins — catches graduates crossing the floor */
async function sweepFresh(): Promise<number> {
  const page = await pumpfunPage(0, "created_timestamp");
  const coins = page.filter((c) => (c.usd_market_cap ?? 0) >= RULES.minMcapUsd && c.mint);
  return enrichAndMerge(coins);
}

let walkCounter = 0;

/** DexScreener enrichment shared by both sweeps, 30 mints per call */
async function enrichAndMerge(coins: PfCoin[]): Promise<number> {
  if (coins.length === 0) return 0;
  const byMint = new Map(coins.map((c) => [c.mint, c]));
  let merged = 0;
  const mints = [...byMint.keys()];
  const chunks: string[][] = [];
  for (let i = 0; i < mints.length; i += 30) chunks.push(mints.slice(i, i + 30));
  // ROTATE the processing order each walk — if the tail of the batch hits the
  // rate limiter, it must be a different tail every time, so the rolling
  // union converges to full coverage instead of keeping a systematic hole
  const shift = chunks.length > 0 ? walkCounter++ % chunks.length : 0;
  const ordered = [...chunks.slice(shift), ...chunks.slice(0, shift)];

  for (const chunk of ordered) {
    let pairs = await dsTokenPairs(chunk);
    if (pairs.length === 0) {
      // patient retry outside the burst window
      await sleep(2_500);
      pairs = await dsTokenPairs(chunk);
    }

    // deepest SOL-quoted pair per mint — that is the pool a fill prices against
    const best = new Map<string, DsPair>();
    for (const p of pairs) {
      if (p.quoteToken.address !== WSOL) continue;
      const liq = p.liquidity?.usd ?? 0;
      const cur = best.get(p.baseToken.address);
      if (!cur || liq > (cur.liquidity?.usd ?? 0)) best.set(p.baseToken.address, p);
    }

    for (const [mint, p] of best) {
      const pf = byMint.get(mint);
      const priceSol = Number(p.priceNative);
      const priceUsd = Number(p.priceUsd);
      const liq = p.liquidity?.usd ?? 0;
      const mcap = p.marketCap ?? p.fdv ?? pf?.usd_market_cap ?? 0;
      if (priceSol <= 0 || priceUsd <= 0) continue;
      if (mcap < RULES.minMcapUsd || liq < 15_000) continue;

      if (priceSol > 0) lastSolUsd = priceUsd / priceSol;
      const createdAt = p.pairCreatedAt ?? pf?.created_timestamp ?? 0;
      mergeInfo(
        {
          mint,
          pairAddress: p.pairAddress,
          symbol: p.baseToken.symbol,
          name: p.baseToken.name,
          imageUrl: p.info?.imageUrl ?? pf?.image_uri,
          priceSol,
          priceUsd,
          mcapUsd: mcap,
          liqUsd: liq,
          vol24Usd: p.volume?.h24 ?? 0,
          chg5m: p.priceChange?.m5 ?? 0,
          chg1h: p.priceChange?.h1 ?? 0,
          chg24h: p.priceChange?.h24 ?? 0,
          ageHours: createdAt > 0 ? Math.max(0, (Date.now() - createdAt) / 3_600_000) : 0,
        },
        liq,
      );
      merged++;
    }
    await sleep(1_000);
  }
  return merged;
}

// ── fallback: geckoterminal rotation ─────────────────────────────────────

interface GtPool {
  attributes: {
    address: string;
    name: string;
    pool_created_at: string | null;
    base_token_price_usd: string | null;
    base_token_price_native_currency: string | null;
    quote_token_price_usd: string | null;
    fdv_usd: string | null;
    market_cap_usd: string | null;
    reserve_in_usd: string | null;
    volume_usd: { h24: string | null };
    price_change_percentage: { m5: string | null; h1: string | null; h24: string | null };
  };
  relationships: {
    base_token: { data: { id: string } };
    quote_token: { data: { id: string } };
  };
}

async function gt(path: string): Promise<GtPool[]> {
  const res = await fetch(`${GT}${path}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 429) console.warn(`[tokens] geckoterminal rate-limited on ${path}`);
    return [];
  }
  const json = await res.json();
  return (json?.data ?? []) as GtPool[];
}

async function sweepGecko(): Promise<void> {
  const rotations = [
    [
      "/networks/solana/dexes/pumpswap/pools?page=1",
      "/networks/solana/dexes/pumpswap/pools?page=2",
      "/networks/solana/dexes/pumpswap/pools?page=3",
      "/networks/solana/new_pools?page=1",
      "/networks/solana/trending_pools?page=1",
    ],
    [
      "/networks/solana/dexes/raydium/pools?page=1",
      "/networks/solana/dexes/raydium/pools?page=2",
      "/networks/solana/pools?page=1",
      "/networks/solana/new_pools?page=1",
      "/networks/solana/trending_pools?page=1",
    ],
  ];
  const paths = rotations[rotation % rotations.length];
  rotation++;

  for (const path of paths) {
    const pools = await gt(path);
    for (const pool of pools) {
      const a = pool.attributes;
      const mint = pool.relationships.base_token.data.id.replace("solana_", "");
      const quote = pool.relationships.quote_token.data.id.replace("solana_", "");
      if (quote !== WSOL) continue;
      if (!mint.toLowerCase().endsWith(RULES.pumpSuffix)) continue;

      const mcap = Number(a.market_cap_usd ?? a.fdv_usd ?? 0);
      const reserve = Number(a.reserve_in_usd ?? 0);
      const priceSol = Number(a.base_token_price_native_currency ?? 0);
      const priceUsd = Number(a.base_token_price_usd ?? 0);
      if (mcap < RULES.minMcapUsd || reserve < 15_000) continue;
      if (priceSol <= 0 || priceUsd <= 0) continue;

      const q = Number(a.quote_token_price_usd ?? 0);
      if (q > 0) lastSolUsd = q;
      const createdAt = a.pool_created_at ? Date.parse(a.pool_created_at) : 0;
      mergeInfo(
        {
          mint,
          pairAddress: a.address,
          symbol: a.name.split(" / ")[0] ?? "?",
          name: a.name.split(" / ")[0] ?? "?",
          priceSol,
          priceUsd,
          mcapUsd: mcap,
          liqUsd: reserve,
          vol24Usd: Number(a.volume_usd?.h24 ?? 0),
          chg5m: Number(a.price_change_percentage?.m5 ?? 0),
          chg1h: Number(a.price_change_percentage?.h1 ?? 0),
          chg24h: Number(a.price_change_percentage?.h24 ?? 0),
          ageHours: createdAt > 0 ? Math.max(0, (Date.now() - createdAt) / 3_600_000) : 0,
        },
        reserve,
      );
    }
    await sleep(400);
  }
}

// ── route ────────────────────────────────────────────────────────────────

let lastFullWalk = 0;

async function sweep(): Promise<{ tokens: TokenInfo[]; solUsd: number }> {
  const full = Date.now() - lastFullWalk > 5 * 60_000;
  let merged = 0;
  try {
    merged = full ? await sweepPumpfun() : await sweepFresh();
    if (full && merged > 0) lastFullWalk = Date.now();
  } catch {
    merged = 0;
  }
  if (full && merged < 10) {
    console.warn(`[tokens] pump.fun listing thin (${merged}) — running geckoterminal fallback`);
    await sweepGecko().catch(() => {});
  }
  return buildUniverse();
}

function kickSweep(): Promise<{ tokens: TokenInfo[]; solUsd: number }> {
  if (!inflight) {
    inflight = sweep()
      .then((fresh) => {
        if (fresh.tokens.length > 0) cache = { at: Date.now(), body: fresh };
        return fresh;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// stale-while-revalidate: nobody ever waits behind a sweep once we have data —
// the restored snapshot answers instantly and the refresh happens behind it
export async function GET() {
  if (cache) {
    if (Date.now() - cache.at >= TTL) void kickSweep().catch(() => {});
    return NextResponse.json(cache.body);
  }
  const fresh = await kickSweep().catch(() => ({ tokens: [], solUsd: 0 }));
  return NextResponse.json(fresh);
}
