// ONE upstream price fetch for the whole fleet. On a single server this was an
// interval; on serverless there is no shared memory, so coordination moves to
// Postgres: marks live in a table, and a row-level lock decides which instance
// pays for the refresh. 1 visitor or 1000, on 1 instance or 50: same API cost.

import { claimLock, ensureSchema, sql, type Row } from "./sql";
import { recordTick } from "./candles";
import type { TokenInfo } from "@/lib/types";

const WSOL = "So11111111111111111111111111111111111111112";
const MAX_HOT = 30; // DexScreener batch limit
const STALE_MS = 3_000;

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

async function heliusOverlay(
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

/** refresh the hot set — only ever called by the instance holding the lock */
async function refresh(): Promise<void> {
  const rows = (await sql`
    SELECT pair FROM mark_wanted
    WHERE wanted_at > ${Date.now() - 5 * 60_000}
    ORDER BY wanted_at DESC LIMIT ${MAX_HOT}
  `) as Row[];
  const hot = rows.map((r) => r.pair as string);
  if (hot.length === 0) return;

  const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${hot.join(",")}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) return;
  const json = await res.json();
  const pairs: DsPair[] = json?.pairs ?? [];
  if (pairs.length === 0) return;

  let solUsd = 0;
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
    fresh.push({
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

  const h = await heliusOverlay(fresh.map((t) => t.mint));
  if (h) {
    solUsd = h.solUsd;
    for (const t of fresh) {
      const usd = h.prices[t.mint];
      if (usd > 0) {
        t.priceUsd = usd;
        t.priceSol = usd / h.solUsd;
      }
    }
  }

  const now = Date.now();
  for (const t of fresh) {
    await sql`
      INSERT INTO marks(pair, mint, data, updated_at)
      VALUES (${t.pairAddress}, ${t.mint}, ${JSON.stringify(t)}, ${now})
      ON CONFLICT(pair) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `;
  }
  await sql`
    INSERT INTO kv(key, value, updated_at) VALUES ('px:solUsd', ${String(solUsd)}, ${now})
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `;
  await sql`
    INSERT INTO kv(key, value, updated_at) VALUES ('px:source', ${h ? "helius" : "dexscreener"}, ${now})
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `;
  await Promise.all(fresh.map((t) => recordTick(t.pairAddress, t.priceUsd).catch(() => {})));
}

/** register interest, refresh if we win the lock, and return what we know */
export async function getPrices(pairs: string[]): Promise<{
  tokens: TokenInfo[];
  solUsd: number;
  source: "helius" | "dexscreener";
}> {
  await ensureSchema();
  const now = Date.now();

  if (pairs.length > 0) {
    // one statement, all pairs — a per-pair round trip would dominate latency
    const values = pairs.map((p) => `('${p.replace(/'/g, "")}', ${now})`).join(",");
    await sql.query(
      `INSERT INTO mark_wanted(pair, wanted_at) VALUES ${values}
       ON CONFLICT(pair) DO UPDATE SET wanted_at = EXCLUDED.wanted_at`,
    );
  }

  // exactly one instance refreshes per window; everyone else serves the marks
  if (await claimLock("prices", STALE_MS)) {
    await refresh().catch(() => {});
  }

  const rows = (await sql`
    SELECT data FROM marks WHERE pair = ANY(${pairs})
  `) as Row[];
  const meta = (await sql`
    SELECT key, value FROM kv WHERE key IN ('px:solUsd', 'px:source')
  `) as Row[];
  const solUsd = Number(meta.find((m) => m.key === "px:solUsd")?.value ?? 0);
  const source = (meta.find((m) => m.key === "px:source")?.value ?? "dexscreener") as
    | "helius"
    | "dexscreener";

  return { tokens: rows.map((r) => r.data as TokenInfo), solUsd, source };
}

/** seed the wanted set so the first visitor already has marks */
export async function seedPairs(pairs: string[]): Promise<void> {
  if (pairs.length === 0) return;
  const at = Date.now() - 60_000; // lower priority than a live view
  const values = pairs
    .slice(0, MAX_HOT)
    .map((p) => `('${p.replace(/'/g, "")}', ${at})`)
    .join(",");
  await sql.query(
    `INSERT INTO mark_wanted(pair, wanted_at) VALUES ${values}
     ON CONFLICT(pair) DO NOTHING`,
  );
}
