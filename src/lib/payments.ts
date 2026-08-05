"use client";

// Real on-chain entry payments: Phantom wallet + SPL transfer, confirmed
// through our /api/rpc proxy (Helius when configured, public RPC otherwise).
// The checkout falls back to fully-simulated mode when no treasury is set.

import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DECIMALS = 6;

/** the firm's receiving wallet — set NEXT_PUBLIC_TREASURY_WALLET to go live */
export const TREASURY = process.env.NEXT_PUBLIC_TREASURY_WALLET ?? "";

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
}

export function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  };
  return w.phantom?.solana ?? w.solana ?? null;
}

/** live payments need a configured treasury AND an injected wallet */
export function realPaymentsAvailable(): boolean {
  if (TREASURY.length < 32) return false;
  try {
    new PublicKey(TREASURY);
  } catch {
    return false;
  }
  return getProvider() !== null;
}

/**
 * Transfer `amountUsd` of USDC to the treasury and wait for on-chain
 * confirmation. Resolves with the transaction signature.
 */
export async function payUsdc(
  amountUsd: number,
  onStep: (line: string) => void,
): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("no Solana wallet found — install Phantom");
  const treasury = new PublicKey(TREASURY);

  onStep("connecting wallet…");
  const { publicKey } = await provider.connect();
  const pk = publicKey.toBase58();
  onStep(`wallet ${pk.slice(0, 4)}…${pk.slice(-4)} connected`);

  const conn = new Connection(`${window.location.origin}/api/rpc`, "confirmed");
  const from = getAssociatedTokenAddressSync(USDC_MINT, publicKey);
  const to = getAssociatedTokenAddressSync(USDC_MINT, treasury);
  const amount = Math.round(amountUsd * 10 ** USDC_DECIMALS);

  onStep(`building usdc transfer · $${amountUsd.toFixed(2)}…`);
  const tx = new Transaction().add(
    // idempotent: creates the treasury's USDC account only if it is missing
    createAssociatedTokenAccountIdempotentInstruction(publicKey, to, treasury, USDC_MINT),
    createTransferCheckedInstruction(from, USDC_MINT, to, publicKey, amount, USDC_DECIMALS),
  );
  tx.feePayer = publicKey;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  onStep("awaiting signature in your wallet…");
  const { signature } = await provider.signAndSendTransaction(tx);
  onStep(`tx ${signature.slice(0, 8)}… sent — confirming on-chain…`);

  const res = await conn.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (res.value.err) throw new Error("transaction failed on-chain");
  return signature;
}
