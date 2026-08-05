import { NextRequest, NextResponse } from "next/server";
import type { Candle } from "@/lib/types";

export const dynamic = "force-dynamic";

const TFS = new Set(["minute", "hour", "day"]);
const cache = new Map<string, { at: number; body: { candles: Candle[] } }>();

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
  if (hit && Date.now() - hit.at < 25_000) return NextResponse.json(hit.body);

  const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=300&currency=usd`;
  const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
  if (!res.ok) return NextResponse.json({ candles: [] }, { status: 502 });
  const json = await res.json();
  const list: number[][] = json?.data?.attributes?.ohlcv_list ?? [];

  // GeckoTerminal returns newest-first — the chart wants ascending unique times
  const seen = new Set<number>();
  const candles: Candle[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const [time, open, high, low, close, volume] = list[i];
    if (seen.has(time)) continue;
    seen.add(time);
    candles.push({ time, open, high, low, close, volume });
  }
  candles.sort((a, b) => a.time - b.time);

  const body = { candles };
  cache.set(key, { at: Date.now(), body });
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return NextResponse.json(body);
}
