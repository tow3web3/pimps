"use client";

// Real on-chain entry payments: Phantom wallet + SPL transfer, confirmed
// through our /api/rpc proxy (Helius when configured, public RPC otherwise).
// Every address comes from /api/config at runtime, so launch day needs no
// rebuild: paste the mint in the admin console and this file follows.

import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DECIMALS = 6;

export interface RuntimeConfig {
  treasuryWallet: string;
  gfMint: string;
  gfDecimals: number;
  paymentsLive: boolean;
  gfLive: boolean;
}

let cachedConfig: RuntimeConfig | null = null;

export async function loadConfig(force = false): Promise<RuntimeConfig> {
  if (cachedConfig && !force) return cachedConfig;
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    cachedConfig = (await res.json()) as RuntimeConfig;
  } catch {
    cachedConfig = {
      treasuryWallet: "",
      gfMint: "",
      gfDecimals: 6,
      paymentsLive: false,
      gfLive: false,
    };
  }
  return cachedConfig;
}

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
  signMessage?: (msg: Uint8Array, encoding: "utf8") => Promise<{ signature: Uint8Array }>;
}

export function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider & { isPhantom?: boolean };
    solflare?: PhantomProvider;
  };
  // Phantom's own namespace is never overwritten by other wallets, so prefer it.
  // Fall back to window.solana only if it can actually sign a message — a
  // multi-chain aggregator that hijacked window.solana without a working bridge
  // (the "IN_PAGE_CHANNEL" errors) is worse than nothing.
  const candidates = [w.phantom?.solana, w.solflare, w.solana];
  for (const p of candidates) {
    if (p && typeof p.connect === "function" && typeof p.signMessage === "function") return p;
  }
  return null;
}

/** race any wallet call against a timeout so a broken extension can't hang us */
export function withWalletTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out — check your wallet extension`)), ms),
    ),
  ]);
}

/**
 * Transfer an SPL token to the treasury and wait for on-chain confirmation.
 * Used for both lanes: USDC at face value, $GF at the discounted price.
 */
async function transferToTreasury(
  opts: {
    mint: PublicKey;
    decimals: number;
    amount: number; // in whole tokens
    label: string;
    symbol: string;
    treasury: string;
  },
  onStep: (line: string) => void,
): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("no Solana wallet found — install Phantom");
  const treasury = new PublicKey(opts.treasury);

  onStep("connecting wallet…");
  const { publicKey } = await provider.connect();
  const pk = publicKey.toBase58();
  onStep(`wallet ${pk.slice(0, 4)}…${pk.slice(-4)} connected`);

  const conn = new Connection(`${window.location.origin}/api/rpc`, "confirmed");
  const from = getAssociatedTokenAddressSync(opts.mint, publicKey);
  const to = getAssociatedTokenAddressSync(opts.mint, treasury);
  const raw = BigInt(Math.round(opts.amount * 10 ** opts.decimals));

  // check the money is there BEFORE popping the wallet — approving a transfer
  // that cannot settle strands the user on a doomed confirmation
  onStep("checking balance…");
  let balance = 0;
  try {
    balance = (await conn.getTokenAccountBalance(from)).value.uiAmount ?? 0;
  } catch {
    balance = 0; // no token account = zero balance
  }
  if (balance < opts.amount) {
    throw new Error(
      `not enough ${opts.symbol} in this wallet — it holds ${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${opts.symbol}, the entry needs ${opts.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    );
  }
  const lamports = await conn.getBalance(publicKey).catch(() => 0);
  if (lamports < 1_500_000) {
    throw new Error(
      "this wallet has no SOL for the network fee — add ~0.01 SOL and retry",
    );
  }

  onStep(`building transfer · ${opts.label}…`);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(publicKey, to, treasury, opts.mint),
    createTransferCheckedInstruction(from, opts.mint, to, publicKey, raw, opts.decimals),
  );
  tx.feePayer = publicKey;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  onStep("awaiting signature in your wallet…");
  const { signature } = await provider.signAndSendTransaction(tx);
  onStep(`tx ${signature.slice(0, 8)}… sent — confirming on-chain…`);

  // poll over HTTP: confirmTransaction subscribes via websocket, which our
  // /api/rpc proxy doesn't speak — it would hang until blockheight expiry
  const deadline = Date.now() + 60_000;
  for (;;) {
    const st = (await conn.getSignatureStatuses([signature])).value[0];
    if (st?.err) throw new Error("transaction failed on-chain — nothing was charged");
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") {
      return signature;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `confirmation timed out — check tx ${signature.slice(0, 8)}… in your wallet before retrying`,
      );
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export async function payUsdc(amountUsd: number, onStep: (l: string) => void): Promise<string> {
  const cfg = await loadConfig(true);
  if (!cfg.treasuryWallet) throw new Error("treasury not configured");
  return transferToTreasury(
    {
      mint: USDC_MINT,
      decimals: USDC_DECIMALS,
      amount: amountUsd,
      label: `$${amountUsd.toFixed(2)} usdc`,
      symbol: "USDC",
      treasury: cfg.treasuryWallet,
    },
    onStep,
  );
}

/** pay the discounted entry in $GF, sized from the live market price */
export async function payGf(amountUsd: number, onStep: (l: string) => void): Promise<string> {
  const cfg = await loadConfig(true);
  if (!cfg.treasuryWallet) throw new Error("treasury not configured");
  if (!cfg.gfMint) throw new Error("the token is not live yet");

  onStep("pricing $GF from the live market…");
  const q = await fetch(`/api/gf-quote?usd=${amountUsd}`, { cache: "no-store" }).then((r) =>
    r.json(),
  );
  if (!q?.tokens || q.tokens <= 0) throw new Error(q?.error ?? "no $GF market yet");
  onStep(`quote: ${Math.round(q.tokens).toLocaleString()} $GF ≈ $${amountUsd.toFixed(2)}`);

  return transferToTreasury(
    {
      mint: new PublicKey(cfg.gfMint),
      decimals: cfg.gfDecimals,
      // a small buffer so a tick between quote and settlement cannot
      // under-pay and get the entry rejected server-side
      amount: q.tokens * 1.01,
      label: `${Math.round(q.tokens).toLocaleString()} $GF`,
      symbol: "$GF",
      treasury: cfg.treasuryWallet,
    },
    onStep,
  );
}

/** live payments need a configured treasury AND an injected wallet */
export async function realPaymentsAvailable(): Promise<boolean> {
  const cfg = await loadConfig();
  return cfg.paymentsLive && getProvider() !== null;
}
