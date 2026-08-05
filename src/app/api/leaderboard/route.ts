import { NextResponse } from "next/server";
import { ensureSchema, sql, type Row } from "@/server/sql";
import { sessionWallet } from "@/server/auth";
import { getMarks } from "@/server/prices";
import { RULES } from "@/lib/rules";

export const dynamic = "force-dynamic";

// Real runs, ranked by percent return. Active runs are marked to market, so the
// board moves while people trade.

interface BoardRow {
  name: string;
  phase: number;
  kind: string;
  returnPct: number;
  trades: number;
  status: "live" | "cleared" | "failed";
  isYou?: boolean;
}

const shorten = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export async function GET() {
  await ensureSchema();
  const me = await sessionWallet();

  // the most recent run per wallet, whatever its state
  const runs = (await sql`
    SELECT r.* FROM runs r
    JOIN (SELECT wallet, MAX(id) AS id FROM runs GROUP BY wallet) last ON last.id = r.id
    ORDER BY r.id DESC LIMIT 200
  `) as Row[];

  const openPositions = (await sql`
    SELECT p.run_id, p.mint, p.qty, p.avg_price_sol FROM positions p
    JOIN runs r ON r.id = p.run_id WHERE r.status = 'active' LIMIT 200
  `) as Row[];

  const mints = [...new Set(openPositions.map((p) => p.mint as string))].slice(0, 60);
  const { marks } = mints.length
    ? await getMarks(mints)
    : { marks: {} as Record<string, { priceSol: number }> };

  const byRun = new Map<number, Row[]>();
  for (const p of openPositions) {
    const id = Number(p.run_id);
    const list = byRun.get(id) ?? [];
    list.push(p);
    byRun.set(id, list);
  }

  const rows: Array<BoardRow & { wallet: string }> = runs.map((r) => {
    const startSol = Number(r.start_sol);
    let equity = Number(r.cash_sol);
    if (r.status === "active") {
      for (const p of byRun.get(Number(r.id)) ?? []) {
        const px = marks[p.mint as string]?.priceSol ?? Number(p.avg_price_sol);
        equity += Number(p.qty) * px * (1 - RULES.feeRate);
      }
    }
    return {
      wallet: r.wallet as string,
      name: shorten(r.wallet as string),
      phase: Number(r.phase) + 1,
      kind: r.kind as string,
      returnPct: startSol > 0 ? ((equity - startSol) / startSol) * 100 : 0,
      trades: Number(r.trade_count),
      status:
        r.status === "failed" ? "failed" : r.status === "active" ? "live" : "cleared",
    };
  });

  rows.sort((a, b) => b.returnPct - a.returnPct);

  return NextResponse.json({
    rows: rows.map(({ wallet, ...r }) => ({
      ...r,
      isYou: me !== null && wallet === me,
      name: me !== null && wallet === me ? "you" : r.name,
    })),
    stats: {
      traders: rows.length,
      live: rows.filter((r) => r.status === "live").length,
      funded: rows.filter((r) => r.kind === "funded").length,
      cleared: rows.filter((r) => r.status === "cleared").length,
    },
    phases: RULES.phases.length,
  });
}
