import { db } from "./db";
import { RULES } from "@/lib/rules";

// Runtime configuration. Values live in SQLite, fall back to env, and take
// effect on the NEXT request — no rebuild, no restart. This exists so the $GF
// mint can be pasted minutes before launch while the site is serving traffic.

export interface RuntimeConfig {
  /** wallet that receives entry fees */
  treasuryWallet: string;
  /** $GF mint address — empty until the token launches */
  gfMint: string;
  /** $GF decimals, read on-chain when the mint is set */
  gfDecimals: number;
}

const read = db.prepare("SELECT value FROM kv WHERE key=?");
const write = db.prepare(
  "INSERT INTO kv(key, value, updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
);

function dbGet(key: string): string | null {
  const row = read.get(`cfg:${key}`) as { value: string } | undefined;
  return row?.value ?? null;
}

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
let warned = false;

/**
 * A Solana public key is 32 bytes (43-44 base58 chars); a secret key is 64
 * (87-88). Pasting a secret where an address belongs would both break payments
 * and leak the key into an address field, so it is refused loudly.
 */
function safeAddress(value: string, label: string): string {
  const v = value.trim();
  if (!v) return "";
  if (!PUBKEY_RE.test(v)) {
    if (!warned) {
      warned = true;
      console.error(
        `[config] ${label} is not a valid Solana address (${v.length} chars). ` +
          `If this is a SECRET key, move it to HOT_WALLET_SECRET_KEY and put the ` +
          `PUBLIC address here. Payments stay simulated until this is fixed.`,
      );
    }
    return "";
  }
  return v;
}

export function getConfig(): RuntimeConfig {
  return {
    treasuryWallet: safeAddress(
      dbGet("treasuryWallet") ?? process.env.TREASURY_WALLET ?? "",
      "TREASURY_WALLET",
    ),
    gfMint: safeAddress(dbGet("gfMint") ?? process.env.GF_MINT ?? RULES.token.mint ?? "", "GF_MINT"),
    gfDecimals: Number(dbGet("gfDecimals") ?? process.env.GF_DECIMALS ?? 6),
  };
}

export function setConfig(patch: Partial<RuntimeConfig>) {
  const now = Date.now();
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    write.run(`cfg:${k}`, String(v), now);
  }
}

/** ask the chain how many decimals the mint uses — guessing this is a money bug */
export async function fetchMintDecimals(mint: string): Promise<number | null> {
  const key = process.env.HELIUS_API_KEY;
  const url = key
    ? `https://mainnet.helius-rpc.com/?api-key=${key}`
    : "https://api.mainnet-beta.solana.com";
  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [mint, { encoding: "jsonParsed" }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const d = json?.result?.value?.data?.parsed?.info?.decimals;
    return typeof d === "number" ? d : null;
  } catch {
    return null;
  }
}

/** live USD price of one $GF, from the deepest SOL pool */
export async function gfPriceUsd(mint: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const pairs = await res.json();
    if (!Array.isArray(pairs) || pairs.length === 0) return null;
    const best = pairs
      .filter((p) => Number(p.priceUsd) > 0)
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const px = Number(best?.priceUsd);
    return px > 0 ? px : null;
  } catch {
    return null;
  }
}
