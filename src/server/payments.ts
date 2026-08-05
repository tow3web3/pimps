// On-chain verification of entry payments. The client sends only a signature;
// the amount, destination and signer are read from the chain itself.

import { db } from "./db";
import { getConfig, gfPriceUsd } from "./config";
import { entryFeeGfUsd, RULES } from "@/lib/rules";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

function rpcUrl(): string {
  const key = process.env.HELIUS_API_KEY;
  return key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : PUBLIC_RPC;
}

export function treasuryWallet(): string {
  return getConfig().treasuryWallet;
}

export function expectedUsd(method: "usdc" | "gf" | "free"): number {
  if (method === "free") return 0;
  return method === "gf" ? entryFeeGfUsd() : RULES.entryFeeUsd;
}

interface TokenBalance {
  mint: string;
  owner?: string;
  uiTokenAmount: { uiAmount: number | null };
}

/**
 * Returns 'verified' | 'simulated'. Throws with a reason when the transfer
 * does not check out. 'simulated' only happens while no treasury is set.
 */
export async function verifyEntryPayment(
  wallet: string,
  method: "usdc" | "gf" | "free",
  txSig?: string,
): Promise<"verified" | "simulated"> {
  const amountUsd = expectedUsd(method);

  if (method === "free") {
    db.prepare(
      "INSERT INTO payments(tx_sig, wallet, method, amount_usd, verified, ts) VALUES(?,?,?,?,1,?)",
    ).run(`free-${wallet}-${Date.now()}`, wallet, "free", 0, Date.now());
    return "verified";
  }

  const cfg = getConfig();
  const treasury = cfg.treasuryWallet;
  if (!treasury) {
    db.prepare(
      "INSERT INTO payments(tx_sig, wallet, method, amount_usd, verified, ts) VALUES(?,?,?,?,0,?)",
    ).run(`sim-${wallet}-${Date.now()}`, wallet, "simulated", amountUsd, Date.now());
    return "simulated";
  }

  if (method === "gf" && !cfg.gfMint) throw new Error("the token is not live yet");
  if (!txSig) throw new Error("transaction signature required");
  const used = db.prepare("SELECT 1 FROM payments WHERE tx_sig=?").get(txSig);
  if (used) throw new Error("this transaction was already used for a seat");

  const res = await fetch(rpcUrl(), {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [
        txSig,
        { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
      ],
    }),
  });
  if (!res.ok) throw new Error("rpc unavailable — retry in a few seconds");
  const json = await res.json();
  const tx = json?.result;
  if (!tx) throw new Error("transaction not found yet — retry in a few seconds");
  if (tx.meta?.err) throw new Error("transaction failed on-chain");
  if (tx.blockTime && Date.now() / 1000 - tx.blockTime > 1800) {
    throw new Error("transaction too old");
  }

  const keys = (tx.transaction?.message?.accountKeys ?? []) as Array<{
    pubkey: string;
    signer?: boolean;
  }>;
  if (!keys.some((k) => k.pubkey === wallet && k.signer)) {
    throw new Error("transaction was not signed by your wallet");
  }

  const mint = method === "gf" ? cfg.gfMint : USDC;
  const balanceOf = (list: TokenBalance[] | undefined) =>
    (list ?? [])
      .filter((b) => b.mint === mint && b.owner === treasury)
      .reduce((a, b) => a + (b.uiTokenAmount.uiAmount ?? 0), 0);
  const delta = balanceOf(tx.meta?.postTokenBalances) - balanceOf(tx.meta?.preTokenBalances);

  if (method === "usdc") {
    if (delta < amountUsd * 0.99) {
      throw new Error(`treasury received $${delta.toFixed(2)} — expected $${amountUsd.toFixed(2)}`);
    }
  } else {
    // $GF: value the tokens actually received at the live price. A 10% band
    // absorbs the price moving between quote and settlement — normal on a
    // launch-day chart, and never in the trader's favour beyond that.
    const price = await gfPriceUsd(mint);
    if (price === null || price <= 0) throw new Error("no $GF market to price the payment");
    const receivedUsd = delta * price;
    if (receivedUsd < amountUsd * 0.9) {
      throw new Error(
        `treasury received ${delta.toLocaleString()} $${RULES.token.symbol} ≈ $${receivedUsd.toFixed(2)} — expected $${amountUsd.toFixed(2)}`,
      );
    }
  }

  db.prepare(
    "INSERT INTO payments(tx_sig, wallet, method, amount_usd, verified, ts) VALUES(?,?,?,?,1,?)",
  ).run(txSig, wallet, method, amountUsd, Date.now());
  return "verified";
}
