import { NextResponse } from "next/server";
import { looksLegitMarket, RULES } from "@/lib/rules";
import { ensureSchema, kvGet, kvSet } from "@/server/sql";
import { replaceEligible } from "@/server/eligibility";
import { seedPairs } from "@/server/priceHub";
import {
  belowFloor,
  crossingStamp,
  noteBelowFloor,
  pruneBelowFloor,
  restoreBelowFloor,
} from "@/server/crossing";
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
const UNSEEN_EXPIRY = 30 * 60_000;
// measured 2026-08-05: ~1050 pump.fun mints sit above the $100K floor —
// the cap must stay comfortably above the real population
const MAX_TOKENS = 1200;

let cache: { at: number; body: { tokens: TokenInfo[]; solUsd: number } } | null = null;
const seen = new Map<string, { info: TokenInfo; reserve: number; lastSeen: number }>();
let lastSolUsd = 0;
let rotation = 0;

// ── cold-start resilience ───────────────────────────────────────────────
// Serverless instances start empty and die often, so the universe is loaded
// from the shared snapshot on first use rather than kept only in memory.
let restored = false;

async function restoreSnapshot() {
  if (restored) return;
  restored = true;
  try {
    const raw = await kvGet("universe");
    if (!raw) return;
    const snap = JSON.parse(raw) as {
      tokens: TokenInfo[];
      solUsd: number;
      below?: [string, number][];
    };
    const now = Date.now();
    // the below-floor memory must survive instance churn, or every crossing
    // witnessed by a dead instance is forgotten
    restoreBelowFloor(snap.below);
    for (const t of snap.tokens ?? []) {
      seen.set(t.mint, {
        info: {
          ...t,
          firstSeenAt: t.firstSeenAt ?? now,
          // bootstrap: snapshots written before crossing detection existed
          // still get honest stamps for tokens hugging the floor
          crossedAt: crossingStamp(t.mint, t.mcapUsd, t, now),
        },
        reserve: t.liqUsd,
        lastSeen: now,
      });
    }
    lastSolUsd = snap.solUsd ?? 0;
    if (snap.tokens?.length) {
      // the stored snapshot predates whatever floors exist today — re-apply
      const kept = [...seen.values()]
        .map((x) => x.info)
        .filter(
          (t) =>
            t.mcapUsd >= RULES.minMcapUsd && t.vol24Usd >= RULES.minVol24Usd && looksLegitMarket(t),
        );
      replaceEligible(kept.map((t) => t.mint));
      cache = { at: Date.now(), body: { tokens: kept, solUsd: lastSolUsd } };
    }
  } catch {
    /* cold start with no snapshot — the first sweep fills it */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mergeInfo(info: TokenInfo, reserve: number) {
  const now = Date.now();
  const prev = seen.get(info.mint);
  const crossedAt = crossingStamp(info.mint, info.mcapUsd, prev?.info, now);
  if (prev && prev.reserve > reserve && now - prev.lastSeen < UNSEEN_EXPIRY) {
    // keep the deepest known pool as the pricing pool, refresh market numbers
    seen.set(info.mint, {
      info: {
        ...info,
        pairAddress: prev.info.pairAddress,
        liqUsd: prev.info.liqUsd,
        firstSeenAt: prev.info.firstSeenAt ?? now,
        crossedAt,
      },
      reserve: prev.reserve,
      lastSeen: now,
    });
  } else {
    seen.set(info.mint, {
      info: { ...info, firstSeenAt: prev?.info.firstSeenAt ?? now, crossedAt },
      reserve,
      lastSeen: now,
    });
  }
}

async function buildUniverse(): Promise<{ tokens: TokenInfo[]; solUsd: number }> {
  const now = Date.now();
  for (const [mint, v] of seen) {
    if (now - v.lastSeen > UNSEEN_EXPIRY) seen.delete(mint);
  }
  const tokens = [...seen.values()]
    .map((x) => x.info)
    // the floors apply at SERVE time too: the rolling union deliberately
    // remembers old entries, so a token whose volume died (or a painted cap
    // that slipped in before the rule) must still fall out of the universe
    .filter(
      (t) =>
        t.mcapUsd >= RULES.minMcapUsd && t.vol24Usd >= RULES.minVol24Usd && looksLegitMarket(t),
    )
    .sort((x, y) => y.vol24Usd - x.vol24Usd)
    .slice(0, MAX_TOKENS);
  replaceEligible(tokens.map((t) => t.mint));
  pruneBelowFloor();
  if (tokens.length > 0) {
    await seedPairs(tokens.slice(0, 30).map((t) => t.pairAddress)).catch(() => {});
    await kvSet(
      "universe",
      JSON.stringify({ tokens, solUsd: lastSolUsd, below: [...belowFloor] }),
    ).catch(() => {});
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
  volume?: { h24?: number; m5?: number };
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
async function sweepPumpfun(maxChunks = 999): Promise<number> {
  const coins: PfCoin[] = [];
  for (let offset = 0; offset < 4000; offset += 50) {
    const page = await pumpfunPage(offset);
    if (page.length === 0) break;
    for (const c of page) {
      if (!c.mint) continue;
      if ((c.usd_market_cap ?? 0) >= RULES.minMcapUsd) coins.push(c);
      else noteBelowFloor(c.mint, c.usd_market_cap ?? 0);
    }
    const tail = page[page.length - 1];
    if ((tail?.usd_market_cap ?? 0) < RULES.minMcapUsd) break;
    await sleep(300);
  }
  return enrichAndMerge(coins, maxChunks);
}

/** cheap probe: the newest coins — catches graduates crossing the floor.
 *  This page is also the ONLY view of coins still below the floor (the mcap
 *  listing is cut around $150K), so it feeds the crossing detector's watch. */
async function sweepFresh(): Promise<number> {
  const page = await pumpfunPage(0, "created_timestamp");
  for (const c of page) {
    if (c.mint) noteBelowFloor(c.mint, c.usd_market_cap ?? 0);
  }
  const coins = page.filter((c) => (c.usd_market_cap ?? 0) >= RULES.minMcapUsd && c.mint);
  return enrichAndMerge(coins);
}

/** DexScreener enrichment shared by both sweeps, 30 mints per call.
 *  `maxChunks` bounds the work so a serverless invocation cannot time out —
 *  the rotation makes successive runs cover the rest. */
async function enrichAndMerge(coins: PfCoin[], maxChunks = 999): Promise<number> {
  if (coins.length === 0) return 0;
  // ASCENDING mcap: the floor region — where crossings happen and data goes
  // stale fastest — leads the batch; the giants ride the price hub anyway
  const byMint = new Map(
    [...coins]
      .sort((a, b) => (a.usd_market_cap ?? 0) - (b.usd_market_cap ?? 0))
      .map((c) => [c.mint, c]),
  );
  let merged = 0;
  const mints = [...byMint.keys()];
  const chunks: string[][] = [];
  for (let i = 0; i < mints.length; i += 30) chunks.push(mints.slice(i, i + 30));
  // ROTATE the processing order each walk — if the tail of the batch hits the
  // rate limiter, it must be a different tail every time, so the rolling
  // union converges to full coverage instead of keeping a systematic hole.
  // The shift derives from WALL-CLOCK, not module state: serverless instances
  // reset counters every invocation, which silently froze the old rotation on
  // the same first chunks forever.
  const shift = chunks.length > 0 ? Math.floor(Date.now() / 300_000) % chunks.length : 0;
  const ordered = [...chunks.slice(shift), ...chunks.slice(0, shift)].slice(0, maxChunks);

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
      const vol24 = p.volume?.h24 ?? 0;
      if (mcap < RULES.minMcapUsd || liq < 15_000 || vol24 < RULES.minVol24Usd) continue;

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
          vol5mUsd: p.volume?.m5 ?? 0,
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
    volume_usd: { h24: string | null; m5: string | null };
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
      const vol24 = Number(a.volume_usd?.h24 ?? 0);
      if (mcap < RULES.minMcapUsd || reserve < 15_000 || vol24 < RULES.minVol24Usd) continue;
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
          vol5mUsd: Number(a.volume_usd?.m5 ?? 0),
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

// ── entry points ────────────────────────────────────────────────────────
// GET is READ-ONLY: a serverless request must never wait behind a multi-minute
// upstream walk. The walk runs in /api/cron/universe and publishes a snapshot.

/** called by the cron: bounded slice of the exhaustive walk */
export async function runUniverseSweep(full: boolean): Promise<number> {
  await ensureSchema();
  await restoreSnapshot();
  let merged = 0;
  try {
    if (full) {
      // the fresh probe rides along EVERY sweep: pump.fun's mcap listing is
      // cut around $150K, so the newest-coins page is the only view of coins
      // below the floor — without it the crossing detector is blind
      await sweepFresh().catch(() => {});
      merged = await sweepPumpfun(12);
    } else {
      merged = await sweepFresh();
    }
  } catch {
    merged = 0;
  }
  if (full && merged < 10) {
    await sweepGecko().catch(() => {});
  }
  const built = await buildUniverse();
  // the cron log line that tells the whole story of a sweep at a glance
  const crossed = built.tokens.filter((t) => t.crossedAt).length;
  console.log(
    `[universe] ${full ? "full" : "fresh"} sweep: merged ${merged}, universe ${built.tokens.length}, crossers ${crossed}, below-floor watch ${belowFloor.size}`,
  );
  return built.tokens.length;
}

export async function GET() {
  await ensureSchema();
  await restoreSnapshot();
  if (cache) return NextResponse.json(cache.body);

  // nothing published yet (very first boot): one cheap probe so the terminal
  // is not empty, then the cron takes over
  try {
    await sweepFresh();
    return NextResponse.json(await buildUniverse());
  } catch {
    return NextResponse.json({ tokens: [], solUsd: 0 });
  }
}
