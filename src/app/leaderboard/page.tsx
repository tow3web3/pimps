"use client";

import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/lib/store";
import { useMarketFeed } from "@/lib/market";
import { buildBoard, insertYou, type BoardRow } from "@/lib/leaderboard";
import { RULES } from "@/lib/rules";
import TopBar from "@/components/TopBar";

function Avatar({ row, size = 26 }: { row: BoardRow; size?: number }) {
  return (
    <span
      className="rounded-full shrink-0 border border-[var(--border)]"
      style={{
        width: size,
        height: size,
        background: row.isYou
          ? "linear-gradient(135deg, var(--cyan), var(--violet))"
          : `linear-gradient(135deg, hsl(${row.hue} 60% 45% / 0.9), hsl(${(row.hue + 60) % 360} 60% 30% / 0.9))`,
        boxShadow: row.isYou ? "0 0 14px var(--cyan-glow)" : "none",
      }}
    />
  );
}

function StatusChip({ status }: { status: BoardRow["status"] }) {
  if (status === "cleared")
    return <span className="chip !text-[var(--up)] !border-[rgba(52,211,153,0.4)]">✓ cleared</span>;
  if (status === "failed")
    return <span className="chip !text-[var(--down)] !border-[rgba(251,113,133,0.4)]">✕ failed</span>;
  return <span className="chip !text-[var(--cyan)] !border-[rgba(34,211,238,0.4)]">● live</span>;
}

export default function LeaderboardPage() {
  useMarketFeed();
  const game = useGame();
  const [now, setNow] = useState(() => Date.now());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(t);
  }, []);

  const rows = useMemo(() => {
    if (!mounted) return [];
    return insertYou(buildBoard(now), {
      returnPct: ((game.equity - RULES.startBalance) / RULES.startBalance) * 100,
      phase: game.phase + 1,
      trades: game.trades.length,
      status:
        game.status === "failed" ? "failed" : game.status === "active" ? "live" : "cleared",
    });
  }, [now, mounted, game.equity, game.phase, game.trades.length, game.status]);

  const podium = rows.slice(0, 3);
  const yourRank = rows.findIndex((r) => r.isYou) + 1;

  // the board depends on wall-clock — render only after mount to avoid hydration drift
  if (!mounted) {
    return (
      <div className="min-h-dvh flex flex-col">
        <TopBar />
        <div className="flex-1 flex items-center justify-center">
          <span className="mono text-xs tracking-[0.3em] text-[var(--ink-3)] animate-pulse">
            LOADING BOARD…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar />

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="panel-title">the board</p>
            <h1 className="text-3xl font-bold mt-1">
              Leaderboard{" "}
              {yourRank > 0 && (
                <span className="mono text-sm text-[var(--cyan)] align-middle ml-2">
                  you: #{yourRank}
                </span>
              )}
            </h1>
          </div>
          <span className="chip">preview cohort · simulated peers · your run is real</span>
        </div>

        {/* podium */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          {podium.map((r, i) => (
            <div
              key={r.name}
              className={`glass p-4 text-center relative ${
                i === 0 ? "!border-[rgba(251,191,36,0.45)] shadow-[0_0_40px_rgba(251,191,36,0.08)]" : ""
              } ${r.isYou ? "!border-[rgba(34,211,238,0.6)]" : ""}`}
            >
              <div className="mono text-[10px] tracking-[0.3em] text-[var(--ink-3)]">
                {i === 0 ? "◆ 01" : i === 1 ? "02" : "03"}
              </div>
              <div className="flex justify-center mt-2">
                <Avatar row={r} size={38} />
              </div>
              <div className={`mono text-[13px] mt-2 truncate ${r.isYou ? "text-[var(--cyan)]" : ""}`}>
                {r.name}
              </div>
              <div
                className={`mono text-xl font-bold mt-1 ${r.returnPct >= 0 ? "text-up" : "text-down"}`}
              >
                {r.returnPct >= 0 ? "+" : ""}
                {r.returnPct.toFixed(1)}%
              </div>
              <div className="mono text-[10px] text-[var(--ink-3)] mt-1">
                challenge 0{r.phase}
              </div>
            </div>
          ))}
        </div>

        {/* table */}
        <div className="glass mt-4 overflow-hidden">
          <table className="w-full mono text-[12px]">
            <thead>
              <tr className="text-[var(--ink-3)] text-left border-b border-[var(--border)]">
                <th className="font-normal px-4 py-2.5 w-12">#</th>
                <th className="font-normal px-2 py-2.5">trader</th>
                <th className="font-normal px-2 py-2.5">phase</th>
                <th className="font-normal px-2 py-2.5 text-right">return</th>
                <th className="font-normal px-2 py-2.5 text-right hidden sm:table-cell">fills</th>
                <th className="font-normal px-4 py-2.5 text-right">status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.name}
                  className={`border-t border-[var(--border)] ${
                    r.isYou
                      ? "bg-[rgba(34,211,238,0.07)] border-l-2 border-l-[var(--cyan)]"
                      : "hover:bg-[rgba(140,160,255,0.03)]"
                  }`}
                >
                  <td className="px-4 py-2.5 text-[var(--ink-3)]">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar row={r} size={22} />
                      <span className={r.isYou ? "text-[var(--cyan)] font-medium" : ""}>
                        {r.name}
                        {r.isYou && <span className="text-[var(--ink-3)]"> · att.{game.attempt}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-[var(--ink-2)]">0{r.phase}</td>
                  <td
                    className={`px-2 py-2.5 text-right font-medium ${
                      r.returnPct >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {r.returnPct >= 0 ? "▲ +" : "▼ "}
                    {Math.abs(r.returnPct).toFixed(1)}%
                  </td>
                  <td className="px-2 py-2.5 text-right text-[var(--ink-2)] hidden sm:table-cell">
                    {r.trades}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <StatusChip status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mono text-[10px] text-[var(--ink-3)] mt-3 text-center">
          returns are % on the {RULES.startBalance} SOL phase stack · board refreshes live · peers
          are simulated until real accounts ship
        </p>
      </main>
    </div>
  );
}
