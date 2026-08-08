// On-chain verification of entry payments. The client sends only a signature;
// the amount, destination and signer are read from the chain itself.

import { sql } from "./sql";
import { getConfig, gfPriceUsd } from "./config";
import { entryFeeGfUsd, RULES } from "@/lib/rules";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

function rpcUrl(): string {
  const key = process.env.HELIUS_API_KEY;
  return key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : PUBLIC_RPC;
}

export async function treasuryWallet(): Promise<string> {
  return (await getConfig()).treasuryWallet;
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
    await sql`
      INSERT INTO payments(tx_sig, wallet, method, amount_usd, verified, ts)
      VALUES (${`free-${wallet}-${Date.now()}`}, ${wallet}, 'free', 0, 1, ${Date.now()})
    `;
    return "verified";
  }

  const cfg = await getConfig();
  const treasury = cfg.treasuryWallet;
  if (!treasury) {
    await sql`
      INSERT INTO payments(tx_sig, wallet, method, amount_usd, verified, ts)
      VALUES (${`sim-${wallet}-${Date.now()}`}, ${wallet}, 'simulated', ${amountUsd}, 0, ${Date.now()})
    `;
    return "simulated";
  }

  if (method === "gf" && !cfg.gfMint) throw new Error("the token is not live yet");
  if (!txSig) throw new Error("transaction signature required");
  // claim the signature FIRST: the primary key is what makes replaying a
  // payment impossible even across concurrent serverless instances
  const claimed = (await sql`
    INSERT INTO payments(tx_sig, wallet, method, amount_usd, verified, ts)
    VALUES (${txSig}, ${wallet}, ${method}, ${amountUsd}, 0, ${Date.now()})
    ON CONFLICT(tx_sig) DO NOTHING
    RETURNING tx_sig
  `) as Array<Record<string, unknown>>;
  if (claimed.length === 0) throw new Error("this transaction was already used for a seat");

  try {
    await verifyOnChain(wallet, method, txSig, treasury, cfg.gfMint, amountUsd);
  } catch (e) {
    // release the claim: "not found yet" happens on the NORMAL happy path
    // (RPC lag right after paying) and the user must be able to retry the
    // same signature — a burned claim would burn their real money. Replay
    // stays impossible: a claim only survives once verification PASSES.
    await sql`DELETE FROM payments WHERE tx_sig = ${txSig} AND verified = 0`.catch(() => {});
    throw e;
  }

  await sql`UPDATE payments SET verified = 1 WHERE tx_sig = ${txSig}`;
  return "verified";
}

async function verifyOnChain(
  wallet: string,
  method: "usdc" | "gf",
  txSig: string,
  treasury: string,
  gfMint: string,
  amountUsd: number,
): Promise<void> {
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

  const mint = method === "gf" ? gfMint : USDC;
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
}
