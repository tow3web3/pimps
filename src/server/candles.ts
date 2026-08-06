// The candle economy: every upstream fetch is stored in Postgres forever, the
// server aggregates its OWN 1-minute candles from price ticks it already pays
// for, and charts are served from the database first.

import { ensureSchema, sql, type Row } from "./sql";
import type { Candle } from "@/lib/types";

const REFRESH_MS = 10 * 60_000;
const SELF_RETENTION_MS = 48 * 3600_000;

/** called by the price feed — one tick becomes/extends the current 1m candle */
export async function recordTick(pool: string, priceUsd: number): Promise<void> {
  return recordTicks([{ pool, priceUsd }]);
}

/** the whole hot set in ONE statement — at a 1s refresh cadence, 30 round
    trips per refresh would cost more time than the refresh window itself */
export async function recordTicks(
  ticks: Array<{ pool: string; priceUsd: number }>,
): Promise<void> {
  const now = Date.now();
  const bucket = Math.floor(now / 60_000) * 60;
  const bucket5s = Math.floor(now / 5_000) * 5;
  const rows = ticks.filter((t) => t.pool && t.priceUsd > 0);
  if (rows.length === 0) return;
  // every tick feeds two ladders: 1m (merges under upstream candles) and 5s
  // (the pure-realtime timeframe upstream can't provide at all)
  const values = rows
    .flatMap((t) => {
      const pool = t.pool.replace(/'/g, "");
      const p = t.priceUsd;
      return [
        `('${pool}','self:1m',${bucket},${p},${p},${p},${p},0)`,
        `('${pool}','self:5s',${bucket5s},${p},${p},${p},${p},0)`,
      ];
    })
    .join(",");
  await sql.query(
    `INSERT INTO candles(pool, tf_key, time, open, high, low, close, volume) VALUES ${values}
     ON CONFLICT(pool, tf_key, time) DO UPDATE SET
       high = GREATEST(candles.high, EXCLUDED.high),
       low = LEAST(candles.low, EXCLUDED.low),
       close = EXCLUDED.close`,
  );
}

export async function storeFetched(
  pool: string,
  tfKey: string,
  candles: Candle[],
): Promise<void> {
  if (candles.length === 0) return;
  // one multi-row insert: 300 round trips would blow the function timeout
  const values = candles
    .map(
      (c) =>
        `('${pool}','${tfKey}',${c.time},${c.open},${c.high},${c.low},${c.close},${c.volume || 0})`,
    )
    .join(",");
  await sql.query(
    `INSERT INTO candles(pool, tf_key, time, open, high, low, close, volume) VALUES ${values}
     ON CONFLICT(pool, tf_key, time) DO UPDATE SET
       open=excluded.open, high=excluded.high, low=excluded.low,
       close=excluded.close, volume=excluded.volume`,
  );
  await markFetchAttempt(pool, tfKey);
}

export async function markFetchAttempt(pool: string, tfKey: string): Promise<void> {
  await sql`
    INSERT INTO candle_meta(key, fetched_at) VALUES (${`${pool}:${tfKey}`}, ${Date.now()})
    ON CONFLICT(key) DO UPDATE SET fetched_at = excluded.fetched_at
  `;
}

export async function isFresh(
  pool: string,
  tfKey: string,
  hasData = true,
): Promise<boolean> {
  const rows = (await sql`
    SELECT fetched_at FROM candle_meta WHERE key = ${`${pool}:${tfKey}`}
  `) as Row[];
  // an EMPTY pool only earns a short cooldown — 10 minutes of blank chart
  // because one upstream call 429'd reads as "the charts are broken"
  const ttl = hasData ? REFRESH_MS : 90_000;
  return rows.length > 0 && Date.now() - Number(rows[0].fetched_at) < ttl;
}

function bucketSecsOf(tfKey: string): number {
  const [tf, agg] = tfKey.split(":");
  const base = tf === "minute" ? 60 : tf === "hour" ? 3600 : 86400;
  return base * Number(agg || 1);
}

/** stored upstream candles + own 1m ticks rolled up to the same buckets */
export async function readMerged(pool: string, tf: string, agg: number): Promise<Candle[]> {
  await ensureSchema();

  // the 5s frame is 100% self-built — upstream has no such granularity
  if (tf === "second") {
    const rows = (await sql`
      SELECT time, open, high, low, close, volume FROM candles
      WHERE pool = ${pool} AND tf_key = 'self:5s'
      ORDER BY time DESC LIMIT 360
    `) as Row[];
    return rows
      .map((r) => ({
        time: Number(r.time),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume),
      }))
      .reverse();
  }

  const tfKey = `${tf}:${agg}`;
  const rows = (await sql`
    SELECT tf_key, time, open, high, low, close, volume FROM candles
    WHERE pool = ${pool} AND tf_key IN (${tfKey}, 'self:1m')
    ORDER BY time DESC LIMIT 800
  `) as Row[];

  const toCandle = (r: Row): Candle => ({
    time: Number(r.time),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  });

  const stored = rows.filter((r) => r.tf_key === tfKey).map(toCandle).reverse();
  if (tf === "day") return stored.slice(-350);

  const selfRows = rows.filter((r) => r.tf_key === "self:1m").map(toCandle).reverse();
  if (selfRows.length === 0) return stored.slice(-350);

  const secs = bucketSecsOf(tfKey);
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

  const merged = [...byTime.values()].sort((a, b) => a.time - b.time);

  // EXCEPT the still-open bucket: the upstream copy of it is as old as the
  // last paid fetch, so letting it win rewinds the live candle on every
  // resync — the chart "replays" the same seconds in a loop. The freshest
  // close always comes from our own ticks.
  const lastM = merged[merged.length - 1];
  const lastSelf = lastM ? buckets.get(lastM.time) : undefined;
  if (lastM && lastSelf) {
    lastM.high = Math.max(lastM.high, lastSelf.high);
    lastM.low = Math.min(lastM.low, lastSelf.low);
    lastM.close = lastSelf.close;
  }

  return merged.slice(-350);
}

/** housekeeping, called from the cron route */
export async function pruneCandles(): Promise<void> {
  await sql`
    DELETE FROM candles WHERE tf_key = 'self:1m' AND time < ${Math.floor(
      (Date.now() - SELF_RETENTION_MS) / 1000,
    )}
  `;
  await sql`
    DELETE FROM candles WHERE tf_key = 'self:5s' AND time < ${Math.floor(
      (Date.now() - 6 * 3600_000) / 1000,
    )}
  `;
  await sql`DELETE FROM mark_wanted WHERE wanted_at < ${Date.now() - 30 * 60_000}`;
  await sql`DELETE FROM sessions WHERE expires_at < ${Date.now()}`;
  await sql`DELETE FROM auth_nonces WHERE expires_at < ${Date.now()}`;
}
