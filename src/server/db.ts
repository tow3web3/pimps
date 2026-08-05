import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

// One SQLite file, one persistent Node process (launchd) — the whole backend.
// WAL mode so reads never block the game writes.

const DATA_DIR = path.join(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, "getfunded.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  wallet TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  wallet TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  wallet TEXT NOT NULL REFERENCES users(wallet),
  expires_at INTEGER NOT NULL
);

-- one row per run: the three challenge phases and the funded account all
-- share this engine; 'tier' distinguishes free / paid / funded capital
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL REFERENCES users(wallet),
  kind TEXT NOT NULL,               -- 'challenge' | 'funded'
  tier TEXT NOT NULL,               -- 'free' | 'paid'
  phase INTEGER NOT NULL DEFAULT 0, -- challenge phase index 0..2
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,             -- 'active' | 'passed' | 'failed' | 'funded' | 'closed'
  fail_reason TEXT,
  cash_sol REAL NOT NULL,
  start_sol REAL NOT NULL,
  principal_usd REAL,               -- funded runs: the account size in USD
  started_at INTEGER NOT NULL,
  ends_at INTEGER,
  ended_at INTEGER,
  trade_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_runs_wallet ON runs(wallet, status);

CREATE TABLE IF NOT EXISTS positions (
  run_id INTEGER NOT NULL REFERENCES runs(id),
  mint TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT,
  qty REAL NOT NULL,
  invested_sol REAL NOT NULL,
  avg_price_sol REAL NOT NULL,
  PRIMARY KEY (run_id, mint)
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  ts INTEGER NOT NULL,
  side TEXT NOT NULL,
  mint TEXT NOT NULL,
  symbol TEXT NOT NULL,
  qty REAL NOT NULL,
  price_sol REAL NOT NULL,
  sol_amount REAL NOT NULL,
  fee_sol REAL NOT NULL,
  pnl_sol REAL
);
CREATE INDEX IF NOT EXISTS idx_trades_run ON trades(run_id, ts DESC);

CREATE TABLE IF NOT EXISTS payments (
  tx_sig TEXT PRIMARY KEY,          -- one seat per on-chain transfer, ever
  wallet TEXT NOT NULL,
  method TEXT NOT NULL,             -- 'usdc' | 'gf' | 'free' | 'simulated'
  amount_usd REAL NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);

-- persistent candle store: pay each upstream fetch ONCE, then serve from here.
-- tf_key 'self:1m' holds candles the server builds from its own price ticks.
CREATE TABLE IF NOT EXISTS candles (
  pool TEXT NOT NULL,
  tf_key TEXT NOT NULL,
  time INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (pool, tf_key, time)
);
CREATE TABLE IF NOT EXISTS candle_meta (
  key TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL
);

-- snapshots that must survive a restart (the token universe above all, so a
-- reboot never shows an empty terminal while the first sweep runs)
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  profit_usd REAL NOT NULL,         -- gross profit being realized
  payout_usd REAL NOT NULL,         -- trader's share after the split
  status TEXT NOT NULL,             -- 'pending' | 'paid' | 'rejected'
  requested_at INTEGER NOT NULL,
  payable_at INTEGER NOT NULL,      -- requested_at + safety delay
  paid_at INTEGER,
  tx_sig TEXT
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status, payable_at);
`);
