// Runs once per server boot (Next instrumentation hook).
// The payout worker pays due withdrawals from the hot wallet — with the
// guardrails: 24h delay (set at request time), a daily cap, and it simply
// stays dormant until HOT_WALLET_SECRET_KEY is configured.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { db } = await import("./server/db");

  const { armBackups } = await import("./server/backup");
  armBackups();

  const { Connection, Keypair, PublicKey, Transaction } = await import("@solana/web3.js");
  const {
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync,
  } = await import("@solana/spl-token");
  const bs58 = (await import("bs58")).default;

  const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const DAILY_CAP = Number(process.env.PAYOUT_DAILY_CAP_USD ?? 500);

  const tick = async () => {
    const secret = process.env.HOT_WALLET_SECRET_KEY;
    if (!secret) return; // plumbing armed, wallet not configured — stay dormant

    const due = db
      .prepare("SELECT * FROM withdrawals WHERE status='pending' AND payable_at <= ? LIMIT 5")
      .all(Date.now()) as Array<{
      id: number;
      wallet: string;
      payout_usd: number;
    }>;
    if (due.length === 0) return;

    const paidToday = (
      db
        .prepare("SELECT COALESCE(SUM(payout_usd),0) s FROM withdrawals WHERE status='paid' AND paid_at > ?")
        .get(Date.now() - 24 * 3600_000) as { s: number }
    ).s;

    let payer: InstanceType<typeof Keypair>;
    try {
      payer = Keypair.fromSecretKey(bs58.decode(secret));
    } catch {
      console.error("[payouts] HOT_WALLET_SECRET_KEY is not valid base58 — worker idle");
      return;
    }

    const key = process.env.HELIUS_API_KEY;
    const conn = new Connection(
      key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : "https://api.mainnet-beta.solana.com",
      "confirmed",
    );

    let spent = paidToday;
    for (const w of due) {
      if (spent + w.payout_usd > DAILY_CAP) {
        console.warn(`[payouts] daily cap $${DAILY_CAP} reached — deferring #${w.id}`);
        break;
      }
      try {
        const dest = new PublicKey(w.wallet);
        const from = getAssociatedTokenAddressSync(USDC, payer.publicKey);
        const to = getAssociatedTokenAddressSync(USDC, dest);
        const amount = Math.round(w.payout_usd * 1e6);
        const tx = new Transaction().add(
          createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, to, dest, USDC),
          createTransferCheckedInstruction(from, USDC, to, payer.publicKey, amount, 6),
        );
        const sig = await conn.sendTransaction(tx, [payer]);
        await conn.confirmTransaction(sig, "confirmed");
        db.prepare("UPDATE withdrawals SET status='paid', paid_at=?, tx_sig=? WHERE id=?").run(
          Date.now(),
          sig,
          w.id,
        );
        spent += w.payout_usd;
        console.log(`[payouts] paid $${w.payout_usd.toFixed(2)} to ${w.wallet.slice(0, 6)}… (${sig.slice(0, 10)}…)`);
      } catch (e) {
        console.error(`[payouts] #${w.id} failed, will retry:`, e instanceof Error ? e.message : e);
      }
    }
  };

  setInterval(() => void tick().catch(() => {}), 60_000);
  console.log("[payouts] worker armed — active once HOT_WALLET_SECRET_KEY is set");
}
