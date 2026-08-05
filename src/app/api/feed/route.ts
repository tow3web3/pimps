import { NextResponse } from "next/server";
import { ensureSchema, sql, type Row } from "@/server/sql";

export const dynamic = "force-dynamic";

// Public tape: what everyone on the desk is trading, right now. Wallets are
// shortened — the board shows activity, never identity.

export async function GET() {
  await ensureSchema();
  const rows = (await sql`
    SELECT t.ts, t.side, t.symbol, t.mint, t.qty, t.sol_amount, t.pnl_sol, r.wallet, r.kind
    FROM trades t
    JOIN runs r ON r.id = t.run_id
    ORDER BY t.id DESC LIMIT 40
  `) as Row[];

  return NextResponse.json({
    trades: rows.map((t) => ({
      ts: Number(t.ts),
      side: t.side as "buy" | "sell",
      symbol: t.symbol as string,
      mint: t.mint as string,
      qty: Number(t.qty),
      solAmount: Number(t.sol_amount),
      pnlSol: t.pnl_sol === null ? null : Number(t.pnl_sol),
      trader: `${(t.wallet as string).slice(0, 4)}…${(t.wallet as string).slice(-4)}`,
      funded: t.kind === "funded",
    })),
  });
}
