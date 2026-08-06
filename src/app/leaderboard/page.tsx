"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RULES } from "@/lib/rules";
import TopBar from "@/components/TopBar";

interface Row {
  name: string;
  phase: number;
  kind: string;
  returnPct: number;
  trades: number;
  status: "live" | "cleared" | "failed";
  isYou?: boolean;
}
interface Board {
  rows: Row[];
  stats: { traders: number; live: number; funded: number; cleared: number };
}

function Avatar({ row, size = 26 }: { row: Row; size?: number }) {
  // deterministic hue from the displayed name — same trader, same colour
  let h = 0;
  for (let i = 0; i < row.name.length; i++) h = (h * 31 + row.name.charCodeAt(i)) % 360;
  return (
    <span
      className="rounded-full shrink-0 border border-[var(--border)]"
      style={{
        width: size,
        height: size,
        background: row.isYou
          ? "linear-gradient(135deg, var(--cyan), var(--violet))"
          : `linear-gradient(135deg, hsl(${h} 55% 45% / 0.9), hsl(${(h + 60) % 360} 55% 30% / 0.9))`,
        boxShadow: row.isYou ? "0 0 14px var(--cyan-glow)" : "none",
      }}
    />
  );
}

function StatusChip({ row }: { row: Row }) {
  if (row.kind === "funded")
    return (
      <span className="chip !text-[var(--violet)] !border-[rgba(255,213,138,0.45)]">◆ funded</span>
    );
  if (row.status === "cleared")
    return <span className="chip !text-[var(--up)] !border-[rgba(0,214,143,0.4)]">✓ cleared</span>;
  if (row.status === "failed")
    return <span className="chip !text-[var(--down)] !border-[rgba(255,82,82,0.4)]">✕ failed</span>;
  return <span className="chip !text-[var(--cyan)] !border-[rgba(255,176,0,0.4)]">● live</span>;
}

export default function LeaderboardPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/leaderboard");
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (!stop) {
          setBoard(j);
          setErr(false);
        }
      } catch {
        if (!stop) setErr(true);
      }
    };
    load();
    const iv = setInterval(load, 10_000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, []);

  const rows = board?.rows ?? [];
  const podium = rows.slice(0, 3);
  const yourRank = rows.findIndex((r) => r.isYou) + 1;

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar />

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="panel-title">the board</p>
            <h1 className="text-2xl md:text-3xl font-bold mt-1">
              Leaderboard
              {yourRank > 0 && (
                <span className="mono text-sm text-[var(--cyan)] align-middle ml-2">
                  you: #{yourRank}
                </span>
              )}
            </h1>
          </div>
          {board && (
            <div className="flex gap-2 flex-wrap">
              <span className="chip">{board.stats.traders} traders</span>
              <span className="chip !text-[var(--cyan)] !border-[rgba(255,176,0,0.35)]">
                {board.stats.live} live
              </span>
              {board.stats.funded > 0 && (
                <span className="chip !text-[var(--violet)] !border-[rgba(255,213,138,0.4)]">
                  {board.stats.funded} funded
                </span>
              )}
            </div>
          )}
        </div>

        {!board && !err && (
          <p className="mono text-xs text-[var(--ink-3)] text-center py-16 animate-pulse">
            LOADING BOARD…
          </p>
        )}
        {err && (
          <p className="mono text-xs text-[var(--down)] text-center py-16">board unavailable</p>
        )}

        {board && rows.length === 0 && (
          <div className="glass p-10 mt-6 text-center">
            <p className="mono text-sm text-[var(--ink-2)]">no runs on the board yet</p>
            <p className="mono text-[11px] text-[var(--ink-3)] mt-2">
              connect a wallet and take a seat — the first name here could be yours
            </p>
            <Link href="/enter" className="btn btn-primary !px-8 !py-3 mt-6 inline-block">
              take a seat ▸
            </Link>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2 md:gap-3 mt-6">
              {podium.map((r, i) => (
                <div
                  key={r.name + i}
                  className={`glass p-3 md:p-4 text-center ${
                    i === 0 ? "!border-[rgba(255,176,0,0.45)]" : ""
                  } ${r.isYou ? "!border-[rgba(255,176,0,0.6)]" : ""}`}
                >
                  <div className="mono text-[10px] tracking-[0.3em] text-[var(--ink-3)]">
                    {i === 0 ? "◆ 01" : i === 1 ? "02" : "03"}
                  </div>
                  <div className="flex justify-center mt-2">
                    <Avatar row={r} size={34} />
                  </div>
                  <div
                    className={`mono text-[11px] md:text-[13px] mt-2 truncate ${r.isYou ? "text-[var(--cyan)]" : ""}`}
                  >
                    {r.name}
                  </div>
                  <div
                    className={`mono text-base md:text-xl font-bold mt-1 ${r.returnPct >= 0 ? "text-up" : "text-down"}`}
                  >
                    {r.returnPct >= 0 ? "+" : ""}
                    {r.returnPct.toFixed(1)}%
                  </div>
                  <div className="mono text-[10px] text-[var(--ink-3)] mt-1">
                    {r.kind === "funded" ? "funded" : `challenge 0${r.phase}`}
                  </div>
                </div>
              ))}
            </div>

            <div className="glass mt-4 overflow-x-auto">
              <table className="w-full mono text-[11px] md:text-[12px] min-w-[420px]">
                <thead>
                  <tr className="text-[var(--ink-3)] text-left border-b border-[var(--border)]">
                    <th className="font-normal px-3 md:px-4 py-2.5 w-10">#</th>
                    <th className="font-normal px-2 py-2.5">trader</th>
                    <th className="font-normal px-2 py-2.5">phase</th>
                    <th className="font-normal px-2 py-2.5 text-right">return</th>
                    <th className="font-normal px-2 py-2.5 text-right hidden sm:table-cell">
                      fills
                    </th>
                    <th className="font-normal px-3 md:px-4 py-2.5 text-right">status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.name + i}
                      className={`border-t border-[var(--border)] ${
                        r.isYou
                          ? "bg-[rgba(255,176,0,0.07)] border-l-2 border-l-[var(--cyan)]"
                          : "hover:bg-[rgba(233,231,221,0.03)]"
                      }`}
                    >
                      <td className="px-3 md:px-4 py-2.5 text-[var(--ink-3)]">{i + 1}</td>
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-2">
                          <Avatar row={r} size={20} />
                          <span className={r.isYou ? "text-[var(--cyan)] font-medium" : ""}>
                            {r.name}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-[var(--ink-2)]">
                        {r.kind === "funded" ? "—" : `0${r.phase}`}
                      </td>
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
                      <td className="px-3 md:px-4 py-2.5 text-right">
                        <StatusChip row={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="mono text-[10px] text-[var(--ink-3)] mt-3 text-center leading-relaxed">
          real runs only · return is % on the {RULES.startBalance} SOL phase stack, marked live ·
          wallet-less preview runs are never listed
        </p>
      </main>
    </div>
  );
}
