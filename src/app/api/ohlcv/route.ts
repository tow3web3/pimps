import { NextRequest, NextResponse } from "next/server";
import type { Candle } from "@/lib/types";

export const dynamic = "force-dynamic";

const TFS = new Set(["minute", "hour", "day"]);
const TTL = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GLOBAL throttle: GeckoTerminal bans bursts, so upstream calls are strictly
// serialized with a 2.2s gap (~27/min, under their limit). Cached and stale
// answers never queue — only true upstream misses wait here.
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

const cache = new Map<string, { at: number; body: { candles: Candle[] } }>();
// GeckoTerminal rate-limits in bursts — a chart that once had candles must
// keep them: stale beats blank, always
const lastGood = new Map<string, { candles: Candle[] }>();

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

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const pool = q.get("pool") ?? "";
  const tf = q.get("tf") ?? "minute";
  const agg = Math.max(1, Math.min(15, Number(q.get("agg") ?? 1)));
  if (!/^[A-Za-z0-9]{30,50}$/.test(pool) || !TFS.has(tf)) {
    return NextResponse.json({ candles: [] }, { status: 400 });
  }

  const key = `${pool}:${tf}:${agg}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.body);

  let candles = await throttled(() => fetchCandles(pool, tf, agg));
  if (candles.length === 0) {
    // one polite retry through the same gate
    candles = await throttled(() => fetchCandles(pool, tf, agg));
  }

  if (candles.length > 0) {
    const body = { candles };
    cache.set(key, { at: Date.now(), body });
    lastGood.set(key, body);
    if (cache.size > 300) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) {
        cache.delete(oldest[0]);
        lastGood.delete(oldest[0]);
      }
    }
    return NextResponse.json(body);
  }

  // upstream down or rate-limited — serve the stale history, retry soon
  const stale = lastGood.get(key);
  if (stale) {
    cache.set(key, { at: Date.now() - TTL + 8_000, body: stale });
    return NextResponse.json(stale);
  }
  return NextResponse.json({ candles: [] });
}
