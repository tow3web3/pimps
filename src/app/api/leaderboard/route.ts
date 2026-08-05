import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { sessionWallet } from "@/server/auth";
import { equityOf, type RunRow } from "@/server/engine";
import { getMarks } from "@/server/prices";
import { RULES } from "@/lib/rules";

export const dynamic = "force-dynamic";

// Real runs, ranked by percent return. Active runs are marked to market, so
// the board moves while people trade. Cached 10s — the board is read far more
// often than it changes.
let cache: { at: number; body: unknown } | null = null;

interface Row {
  wallet: string;
  name: string;
  phase: number;
  kind: string;
  returnPct: number;
  trades: number;
  status: "live" | "cleared" | "failed";
}

const shorten = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export async function GET() {
  const me = await sessionWallet();

  if (!cache || Date.now() - cache.at > 10_000) {
    // the most recent run per wallet, whatever its state
    const runs = db
      .prepare(
        `SELECT r.* FROM runs r
         JOIN (SELECT wallet, MAX(id) id FROM runs GROUP BY wallet) last
           ON last.id = r.id
         ORDER BY r.id DESC LIMIT 200`,
      )
      .all() as RunRow[];

    // one price call for every open position on the board
    const mints = (
      db
        .prepare(
          `SELECT DISTINCT p.mint FROM positions p
           JOIN runs r ON r.id = p.run_id WHERE r.status='active' LIMIT 60`,
        )
        .all() as Array<{ mint: string }>
    ).map((r) => r.mint);
    const { marks } = mints.length ? await getMarks(mints) : { marks: {} };

    const rows: Row[] = runs.map((r) => {
      const equity = r.status === "active" ? equityOf(r, marks) : r.cash_sol;
      return {
        wallet: r.wallet,
        name: shorten(r.wallet),
        phase: r.phase + 1,
        kind: r.kind,
        returnPct: ((equity - r.start_sol) / r.start_sol) * 100,
        trades: r.trade_count,
        status:
          r.status === "failed" ? "failed" : r.status === "active" ? "live" : "cleared",
      };
    });

    rows.sort((a, b) => b.returnPct - a.returnPct);
    cache = {
      at: Date.now(),
      body: {
        rows,
        stats: {
          traders: rows.length,
          live: rows.filter((r) => r.status === "live").length,
          funded: rows.filter((r) => r.kind === "funded").length,
          cleared: rows.filter((r) => r.status === "cleared").length,
        },
        phases: RULES.phases.length,
      },
    };
  }

  const body = cache.body as { rows: Row[] };
  // mark the caller's own row so the client can highlight it without knowing
  // any other wallet's identity
  return NextResponse.json({
    ...body,
    rows: body.rows.map((r) => ({
      ...r,
      wallet: undefined,
      isYou: me !== null && r.wallet === me,
      name: me !== null && r.wallet === me ? "you" : r.name,
    })),
  });
}
