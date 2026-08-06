import { neon } from "@neondatabase/serverless";

// Postgres over HTTP (Neon). Serverless-safe: no pool, no persistent socket,
// every call is a stateless request — which is what Vercel functions need.

const url = process.env.DATABASE_URL;
if (!url) {
  // fail loudly at import time rather than mysteriously at the first query
  console.error("[sql] DATABASE_URL is not set — the app cannot store anything");
}

export const sql = neon(url ?? "postgres://invalid/invalid");

/** Rows come back as plain objects; this narrows the awkward typing. */
export type Row = Record<string, unknown>;

let ready: Promise<void> | null = null;

/**
 * Creates the schema if needed. Runs at most once per instance, and is safe to
 * call from every entry point — a cold start elsewhere may have already done it.
 */
export function ensureSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS users (
      wallet TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS auth_nonces (
      wallet TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      expires_at BIGINT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      expires_at BIGINT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS runs (
      id BIGSERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      kind TEXT NOT NULL,
      tier TEXT NOT NULL,
      phase INTEGER NOT NULL DEFAULT 0,
      attempt INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      fail_reason TEXT,
      cash_sol DOUBLE PRECISION NOT NULL,
      start_sol DOUBLE PRECISION NOT NULL,
      principal_usd DOUBLE PRECISION,
      started_at BIGINT NOT NULL,
      ends_at BIGINT,
      ended_at BIGINT,
      trade_count INTEGER NOT NULL DEFAULT 0
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_runs_wallet ON runs(wallet, status)`;
    await sql`CREATE TABLE IF NOT EXISTS positions (
      run_id BIGINT NOT NULL,
      mint TEXT NOT NULL,
      pair_address TEXT NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT,
      qty DOUBLE PRECISION NOT NULL,
      invested_sol DOUBLE PRECISION NOT NULL,
      avg_price_sol DOUBLE PRECISION NOT NULL,
      avg_price_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      PRIMARY KEY (run_id, mint)
    )`;
    // migration for tables created before the usd column existed
    await sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS avg_price_usd DOUBLE PRECISION NOT NULL DEFAULT 0`;
    await sql`CREATE TABLE IF NOT EXISTS trades (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT NOT NULL,
      ts BIGINT NOT NULL,
      side TEXT NOT NULL,
      mint TEXT NOT NULL,
      symbol TEXT NOT NULL,
      qty DOUBLE PRECISION NOT NULL,
      price_sol DOUBLE PRECISION NOT NULL,
      sol_amount DOUBLE PRECISION NOT NULL,
      fee_sol DOUBLE PRECISION NOT NULL,
      pnl_sol DOUBLE PRECISION
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_trades_run ON trades(run_id, ts DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS payments (
      tx_sig TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      method TEXT NOT NULL,
      amount_usd DOUBLE PRECISION NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      ts BIGINT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS withdrawals (
      id BIGSERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      run_id BIGINT NOT NULL,
      profit_usd DOUBLE PRECISION NOT NULL,
      payout_usd DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL,
      requested_at BIGINT NOT NULL,
      payable_at BIGINT NOT NULL,
      paid_at BIGINT,
      tx_sig TEXT
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status, payable_at)`;
    await sql`CREATE TABLE IF NOT EXISTS candles (
      pool TEXT NOT NULL,
      tf_key TEXT NOT NULL,
      time BIGINT NOT NULL,
      open DOUBLE PRECISION NOT NULL,
      high DOUBLE PRECISION NOT NULL,
      low DOUBLE PRECISION NOT NULL,
      close DOUBLE PRECISION NOT NULL,
      volume DOUBLE PRECISION NOT NULL DEFAULT 0,
      PRIMARY KEY (pool, tf_key, time)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS candle_meta (
      key TEXT PRIMARY KEY,
      fetched_at BIGINT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at BIGINT NOT NULL
    )`;
    // live marks shared by every instance — this is what replaces the
    // in-process price hub once the server is no longer a single process
    await sql`CREATE TABLE IF NOT EXISTS marks (
      pair TEXT PRIMARY KEY,
      mint TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at BIGINT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS mark_wanted (
      pair TEXT PRIMARY KEY,
      wanted_at BIGINT NOT NULL
    )`;
  })().catch((e) => {
    ready = null; // let a later request retry the bootstrap
    throw e;
  });
  return ready;
}

/**
 * Best-effort distributed lock on top of kv. Returns true when THIS instance
 * won the right to do the work — the pattern that keeps one shared upstream
 * fetch across many serverless instances.
 */
export async function claimLock(name: string, ttlMs: number): Promise<boolean> {
  const now = Date.now();
  const key = `lock:${name}`;
  const rows = (await sql`
    INSERT INTO kv(key, value, updated_at) VALUES (${key}, ${String(now)}, ${now})
    ON CONFLICT(key) DO UPDATE SET value = ${String(now)}, updated_at = ${now}
    WHERE kv.updated_at < ${now - ttlMs}
    RETURNING key
  `) as Row[];
  return rows.length > 0;
}

export async function kvGet(key: string): Promise<string | null> {
  const rows = (await sql`SELECT value FROM kv WHERE key = ${key}`) as Row[];
  return rows.length ? (rows[0].value as string) : null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO kv(key, value, updated_at) VALUES (${key}, ${value}, ${Date.now()})
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `;
}
