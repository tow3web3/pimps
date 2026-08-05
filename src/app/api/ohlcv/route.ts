import { NextRequest, NextResponse } from "next/server";
import type { Candle } from "@/lib/types";
import { isFresh, markFetchAttempt, readMerged, storeFetched } from "@/server/candles";

export const dynamic = "force-dynamic";

const TFS = new Set(["minute", "hour", "day"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GLOBAL throttle: GeckoTerminal bans bursts, so upstream calls are strictly
// serialized with a 2.2s gap (~27/min). With the SQLite store in front, a
// pool costs ONE upstream call ever, then one background refresh per 10 min.
let gate: Promise<unknown> = Promise.resolve();
let lastCall = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(async () => {
    const wait = Math.max(0, lastCall + 2_200 - Date.now());
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fn();
  });
  gate = run.catch(() => undefined);
  return run;
}

async function fetchCandles(pool: string, tf: string, agg: number): Promise<Candle[]> {
  const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=300&currency=usd`;
  const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const json = await res.json();
  const list: number[][] = json?.data?.attributes?.ohlcv_list ?? [];
  const seen = new Set<number>();
  const candles: Candle[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const [time, open, high, low, close, volume] = list[i];
    if (seen.has(time)) continue;
    seen.add(time);
    candles.push({ time, open, high, low, close, volume });
  }
  candles.sort((a, b) => a.time - b.time);
  return candles;
}

const inflight = new Set<string>();

async function refresh(pool: string, tf: string, agg: number): Promise<Candle[]> {
  const tfKey = `${tf}:${agg}`;
  const key = `${pool}:${tfKey}`;
  if (inflight.has(key)) return [];
  inflight.add(key);
  try {
    let candles = await throttled(() => fetchCandles(pool, tf, agg));
    if (candles.length === 0) candles = await throttled(() => fetchCandles(pool, tf, agg));
    if (candles.length > 0) storeFetched(pool, tfKey, candles);
    else markFetchAttempt(pool, tfKey); // 10 min before re-trying an empty pool
    return candles;
  } finally {
    inflight.delete(key);
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const pool = q.get("pool") ?? "";
  const tf = q.get("tf") ?? "minute";
  const agg = Math.max(1, Math.min(15, Number(q.get("agg") ?? 1)));
  if (!/^[A-Za-z0-9]{30,50}$/.test(pool) || !TFS.has(tf)) {
    return NextResponse.json({ candles: [] }, { status: 400 });
  }

  const stored = readMerged(pool, tf, agg);

  if (isFresh(pool, `${tf}:${agg}`)) {
    return NextResponse.json({ candles: stored });
  }

  if (stored.length > 0) {
    // serve instantly, refresh behind the scenes (persistent node process)
    void refresh(pool, tf, agg).catch(() => {});
    return NextResponse.json({ candles: stored });
  }

  // first time this pool is charted — one paid fetch, stored forever
  await refresh(pool, tf, agg).catch(() => {});
  return NextResponse.json({ candles: readMerged(pool, tf, agg) });
}
