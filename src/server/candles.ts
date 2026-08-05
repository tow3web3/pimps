// The candle economy: every upstream fetch is stored forever, the server
// aggregates its OWN 1-minute candles from price ticks it already pays for,
// and charts are served from SQLite first — upstream refreshes happen in the
// background at most every 10 minutes per pool.

import { db } from "./db";
import type { Candle } from "@/lib/types";

const REFRESH_MS = 10 * 60_000;
const SELF_RETENTION_MS = 48 * 3600_000;

const upsertSelf = db.prepare(`
  INSERT INTO candles(pool, tf_key, time, open, high, low, close, volume)
  VALUES(?, 'self:1m', ?, ?, ?, ?, ?, 0)
  ON CONFLICT(pool, tf_key, time) DO UPDATE SET
    high = MAX(high, excluded.high),
    low = MIN(low, excluded.low),
    close = excluded.close
`);
const insertFetched = db.prepare(`
  INSERT INTO candles(pool, tf_key, time, open, high, low, close, volume)
  VALUES(?,?,?,?,?,?,?,?)
  ON CONFLICT(pool, tf_key, time) DO UPDATE SET
    open=excluded.open, high=excluded.high, low=excluded.low,
    close=excluded.close, volume=excluded.volume
`);
const readCandles = db.prepare(
  "SELECT time, open, high, low, close, volume FROM candles WHERE pool=? AND tf_key=? ORDER BY time DESC LIMIT 350",
);
const readMeta = db.prepare("SELECT fetched_at FROM candle_meta WHERE key=?");
const writeMeta = db.prepare(
  "INSERT INTO candle_meta(key, fetched_at) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET fetched_at=excluded.fetched_at",
);

let selfWrites = 0;

/** called by the price feed — one tick becomes/extends the current 1m candle */
export function recordTick(pool: string, priceUsd: number) {
  if (!pool || priceUsd <= 0) return;
  const bucket = Math.floor(Date.now() / 60_000) * 60;
  upsertSelf.run(pool, bucket, priceUsd, priceUsd, priceUsd, priceUsd);
  if (++selfWrites % 2_000 === 0) {
    db.prepare("DELETE FROM candles WHERE tf_key='self:1m' AND time < ?").run(
      Math.floor((Date.now() - SELF_RETENTION_MS) / 1000),
    );
  }
}

export function storeFetched(pool: string, tfKey: string, candles: Candle[]) {
  if (candles.length === 0) return;
  const txn = db.transaction(() => {
    for (const c of candles) {
      insertFetched.run(pool, tfKey, c.time, c.open, c.high, c.low, c.close, c.volume);
    }
    writeMeta.run(`${pool}:${tfKey}`, Date.now());
    const cutoff = candles[candles.length - 1].time - 500 * bucketSecsOf(tfKey);
    db.prepare("DELETE FROM candles WHERE pool=? AND tf_key=? AND time < ?").run(
      pool,
      tfKey,
      cutoff,
    );
  });
  txn();
}

export function markFetchAttempt(pool: string, tfKey: string) {
  writeMeta.run(`${pool}:${tfKey}`, Date.now());
}

export function isFresh(pool: string, tfKey: string): boolean {
  const row = readMeta.get(`${pool}:${tfKey}`) as { fetched_at: number } | undefined;
  return !!row && Date.now() - row.fetched_at < REFRESH_MS;
}

function bucketSecsOf(tfKey: string): number {
  const [tf, agg] = tfKey.split(":");
  const base = tf === "minute" ? 60 : tf === "hour" ? 3600 : 86400;
  return base * Number(agg || 1);
}

/** stored upstream candles + own 1m ticks rolled up to the same buckets */
export function readMerged(pool: string, tf: string, agg: number): Candle[] {
  const tfKey = `${tf}:${agg}`;
  const stored = (readCandles.all(pool, tfKey) as Candle[]).reverse();

  const secs = bucketSecsOf(tfKey);
  if (tf === "day") return stored;

  const selfRows = (readCandles.all(pool, "self:1m") as Candle[]).reverse();
  if (selfRows.length === 0) return stored;

  // roll our 1m candles into the requested buckets
  const buckets = new Map<number, Candle>();
  for (const c of selfRows) {
    const t = Math.floor(c.time / secs) * secs;
    const b = buckets.get(t);
    if (!b) buckets.set(t, { ...c, time: t });
    else {
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
    }
  }

  // upstream wins where it exists (it carries real volume); ours fill the rest
  const byTime = new Map<number, Candle>();
  for (const [t, c] of buckets) byTime.set(t, c);
  for (const c of stored) byTime.set(c.time, c);

  return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-350);
}
