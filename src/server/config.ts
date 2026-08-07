import { ensureSchema, kvGet, kvSet } from "./sql";
import { RULES } from "@/lib/rules";

// Runtime configuration. Values live in Postgres, fall back to env, and take
// effect on the NEXT request — no redeploy. This exists so the $GF mint can be
// pasted minutes before launch while the site is serving traffic.

export interface RuntimeConfig {
  treasuryWallet: string;
  gfMint: string;
  gfDecimals: number;
}

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
let warned = false;

/**
 * A Solana public key is 32 bytes (43-44 base58 chars); a secret key is 64
 * (87-88). Pasting a secret where an address belongs would both break payments
 * and leak the key into an address field, so it is refused loudly.
 */
function safeAddress(value: string, label: string): string {
  const v = (value ?? "").trim();
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

export async function getConfig(): Promise<RuntimeConfig> {
  await ensureSchema();
  const [treasury, mint, decimals] = await Promise.all([
    kvGet("cfg:treasuryWallet"),
    kvGet("cfg:gfMint"),
    kvGet("cfg:gfDecimals"),
  ]);
  return {
    treasuryWallet: safeAddress(treasury ?? process.env.TREASURY_WALLET ?? "", "TREASURY_WALLET"),
    gfMint: safeAddress(mint ?? process.env.GF_MINT ?? RULES.token.mint ?? "", "GF_MINT"),
    gfDecimals: Number(decimals ?? process.env.GF_DECIMALS ?? 6),
  };
}

export async function setConfig(patch: Partial<RuntimeConfig>): Promise<void> {
  await ensureSchema();
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    await kvSet(`cfg:${k}`, String(v));
  }
  // a new (or cleared) mint restarts launch detection from zero
  if (patch.gfMint !== undefined) await kvSet("gf:marketLive", "0");
}

/* ── launch detection ────────────────────────────────────────────────────
   The CA can be stored BEFORE the token exists. Until a real market is
   detected the mint stays private (whitepaper + public config hide it, so
   nobody can snipe the address pre-announcement) and the $GF lane stays
   locked. The probe runs at most every 30s per instance, and the first
   positive result is sticky in Postgres. */

const PUMP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
let probeCache: { at: number; live: boolean } | null = null;

export async function gfMarketLive(mint: string): Promise<boolean> {
  if (!mint) return false;
  if ((await kvGet("gf:marketLive")) === "1") return true;
  if (probeCache && Date.now() - probeCache.at < 30_000) return probeCache.live;

  let live = false;
  // an indexed AMM/bonding pool with a price is the strongest signal
  const px = await gfPriceUsd(mint);
  if (px !== null && px > 0) live = true;
  if (!live) {
    // pump.fun's own record appears the second the coin is created
    try {
      const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
        cache: "no-store",
        headers: { accept: "application/json", "user-agent": PUMP_UA },
      });
      if (r.ok) {
        const j = await r.json();
        live = Number(j?.usd_market_cap ?? 0) > 0;
      }
    } catch {
      /* probe again next window */
    }
  }

  probeCache = { at: Date.now(), live };
  if (live) await kvSet("gf:marketLive", "1");
  return live;
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
