"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useGame } from "@/lib/store";
import { useMarketFeed } from "@/lib/market";
import { fundedAccountUsd, RULES } from "@/lib/rules";
import { fmtCompact, fmtSignedSol, fmtSol, fmtUsd } from "@/lib/format";
import TopBar from "@/components/TopBar";
import GameOverlays from "@/components/GameOverlays";

function EquityCurve() {
  const { equitySeries, phase } = useGame();
  const target = RULES.phases[phase].target;

  if (equitySeries.length < 2) {
    return (
      <div className="h-[180px] flex items-center justify-center">
        <span className="mono text-xs text-[var(--ink-3)]">
          the curve draws itself as you trade
        </span>
      </div>
    );
  }

  const W = 800;
  const H = 180;
  const PAD = 8;
  const t0 = equitySeries[0].t;
  const t1 = equitySeries[equitySeries.length - 1].t || t0 + 1;
  const values = equitySeries.map((p) => p.v);
  const lo = Math.min(...values, RULES.failFloor) - 0.4;
  const hi = Math.max(...values, target) + 0.4;
  const x = (t: number) => PAD + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);

  const line = equitySeries.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)},${H - PAD} L${x(t0).toFixed(1)},${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[180px]" role="img" aria-label="equity curve">
      <defs>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(34,211,238,0.28)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0)" />
        </linearGradient>
      </defs>
      {/* target / start / floor reference lines */}
      <line x1={PAD} x2={W - PAD} y1={y(target)} y2={y(target)} stroke="rgba(34,211,238,0.4)" strokeDasharray="5 5" strokeWidth="1" />
      <line x1={PAD} x2={W - PAD} y1={y(RULES.startBalance)} y2={y(RULES.startBalance)} stroke="rgba(140,160,255,0.2)" strokeDasharray="2 5" strokeWidth="1" />
      <line x1={PAD} x2={W - PAD} y1={y(RULES.failFloor)} y2={y(RULES.failFloor)} stroke="rgba(251,113,133,0.45)" strokeDasharray="5 5" strokeWidth="1" />
      <text x={W - PAD - 4} y={y(target) - 5} textAnchor="end" className="mono" fontSize="10" fill="rgba(34,211,238,0.8)">target {fmtSol(target, 0)}</text>
      <text x={W - PAD - 4} y={y(RULES.failFloor) - 5} textAnchor="end" className="mono" fontSize="10" fill="rgba(251,113,133,0.8)">fail {fmtSol(RULES.failFloor, 1)}</text>
      <path d={area} fill="url(#eq-fill)" />
      <path d={line} fill="none" stroke="var(--cyan)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function DashboardPage() {
  useMarketFeed();
  const game = useGame();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const stats = useMemo(() => {
    const sells = game.trades.filter((t) => t.pnlSol !== undefined);
    const wins = sells.filter((t) => (t.pnlSol ?? 0) > 0);
    const best = sells.length ? Math.max(...sells.map((t) => t.pnlSol ?? 0)) : 0;
    const worst = sells.length ? Math.min(...sells.map((t) => t.pnlSol ?? 0)) : 0;
    return {
      fills: game.trades.length,
      winRate: sells.length ? (wins.length / sells.length) * 100 : null,
      best,
      worst,
    };
  }, [game.trades]);

  if (!mounted) return <div className="h-dvh" />;

  const phaseState = (i: number): "cleared" | "live" | "locked" | "funded" => {
    if (game.status === "funded") return i <= 2 ? "cleared" : "funded";
    if (i < game.phase) return "cleared";
    if (i === game.phase) return "live";
    return "locked";
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar />

      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        {/* the gauntlet */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {RULES.phases.map((p, i) => {
            const st = phaseState(i);
            return (
              <div
                key={p.num}
                className={`glass glass-hover p-5 relative overflow-hidden ${
                  st === "live" ? "!border-[rgba(34,211,238,0.4)]" : ""
                } ${st === "cleared" ? "!border-[rgba(52,211,153,0.35)]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="panel-title">challenge 0{p.num}</span>
                  <span
                    className={`chip ${
                      st === "cleared"
                        ? "!text-[var(--up)] !border-[rgba(52,211,153,0.4)]"
                        : st === "live"
                          ? "!text-[var(--cyan)] !border-[rgba(34,211,238,0.4)]"
                          : ""
                    }`}
                  >
                    {st === "cleared" ? "✓ cleared" : st === "live" ? "● live" : "locked"}
                  </span>
                </div>
                <div className="mono text-3xl font-bold mt-3">
                  {p.gainLabel}
                  <span className="text-sm text-[var(--ink-3)] font-normal ml-2">
                    → {fmtSol(p.target, 0)} SOL
                  </span>
                </div>
                <p className="mono text-[10px] text-[var(--ink-3)] mt-2">
                  {RULES.startBalance} SOL start · floor {fmtSol(RULES.failFloor, 1)} · min{" "}
                  {RULES.minTrades} fills · {RULES.challengeDays}d
                </p>
                {st === "live" && (
                  <div className="mt-4">
                    <div className="meter">
                      <div
                        className="meter-fill shimmer"
                        style={{
                          width: `${Math.max(0, Math.min(100, ((game.equity - RULES.startBalance) / (p.target - RULES.startBalance)) * 100))}%`,
                          background: "linear-gradient(90deg, var(--cyan), var(--violet))",
                        }}
                      />
                    </div>
                    <div className="flex justify-between mono text-[10px] text-[var(--ink-3)] mt-1.5">
                      <span>{fmtSol(game.equity, 2)} SOL</span>
                      <span>attempt #{game.attempt}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* equity curve */}
        <div className="glass p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="panel-title">equity curve · challenge 0{RULES.phases[game.phase].num}</span>
            <Link href="/terminal" className="chip hover:!text-[var(--cyan)] hover:!border-[rgba(34,211,238,0.4)] transition-colors">
              open terminal ▸
            </Link>
          </div>
          <EquityCurve />
        </div>

        {/* session stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "fills", value: String(stats.fills) },
            {
              label: "win rate",
              value: stats.winRate === null ? "—" : `${stats.winRate.toFixed(0)}%`,
            },
            {
              label: "best trade",
              value: `${fmtSignedSol(stats.best)} SOL`,
              cls: stats.best > 0 ? "text-up" : "",
            },
            {
              label: "worst trade",
              value: `${fmtSignedSol(stats.worst)} SOL`,
              cls: stats.worst < 0 ? "text-down" : "",
            },
          ].map((s) => (
            <div key={s.label} className="glass p-4">
              <div className="panel-title">{s.label}</div>
              <div className={`mono text-xl mt-1.5 ${s.cls ?? ""}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* run history + the prize */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-3">
          <div className="glass overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)]">
              <span className="panel-title">run history</span>
            </div>
            {game.history.length === 0 ? (
              <p className="mono text-xs text-[var(--ink-3)] p-5">
                no finished runs yet — every cleared or failed challenge is recorded here,
                permanently.
              </p>
            ) : (
              <table className="w-full mono text-[11px]">
                <thead>
                  <tr className="text-[var(--ink-3)] text-left">
                    <th className="font-normal px-5 py-2">run</th>
                    <th className="font-normal px-2 py-2">outcome</th>
                    <th className="font-normal px-2 py-2 text-right">final equity</th>
                    <th className="font-normal px-5 py-2 text-right">fills</th>
                  </tr>
                </thead>
                <tbody>
                  {[...game.history].reverse().map((h, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="px-5 py-2.5">
                        ch.0{h.phase} · att.{h.attempt}
                      </td>
                      <td className={`px-2 py-2.5 ${h.outcome === "passed" ? "text-up" : "text-down"}`}>
                        {h.outcome === "passed" ? "✓ cleared" : "✕ failed"}
                      </td>
                      <td className="px-2 py-2.5 text-right">{fmtSol(h.finalEquity, 2)} SOL</td>
                      <td className="px-5 py-2.5 text-right text-[var(--ink-2)]">{h.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="glass p-5 flex flex-col justify-between !border-[rgba(167,139,250,0.3)]">
            <div>
              <span className="panel-title !text-[var(--violet)]">
                the prize{game.tier === "free" ? " · free roll" : ""}
              </span>
              <div className="mono text-3xl font-bold mt-2 gradient-text">
                {fmtUsd(game.tier === "free" ? RULES.freeRewardUsd : fundedAccountUsd())}
              </div>
              <p className="mono text-[11px] text-[var(--ink-2)] mt-2 leading-relaxed">
                {game.tier === "free"
                  ? "free roll · clear all three and $50 is sent straight to your Phantom."
                  : `clear all three and ${fmtUsd(fundedAccountUsd())} is sent straight to your Phantom — ${RULES.fundedMultiple}x your entry, no strings.`}
              </p>
            </div>
            <p className="mono text-[10px] text-[var(--ink-3)] mt-4">
              universe: pump.fun mints ≥ {fmtCompact(RULES.minMcapUsd)} mcap · real prices, demo
              stack
            </p>
            {game.serverWithdrawals.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <span className="panel-title">withdrawals</span>
                {game.serverWithdrawals.slice(0, 5).map((w) => (
                  <div key={w.id} className="flex justify-between mono text-[11px]">
                    <span
                      className={
                        w.status === "paid"
                          ? "text-up"
                          : w.status === "pending"
                            ? "text-[var(--amber)]"
                            : "text-down"
                      }
                    >
                      {w.status === "paid" ? "✓" : w.status === "pending" ? "⏳" : "✕"} {w.status}
                    </span>
                    <span>{fmtUsd(w.payout_usd)}</span>
                  </div>
                ))}
              </div>
            )}
            {game.lastPayment && (
              <span
                className={`chip self-start mt-3 ${
                  game.lastPayment.method === "gf"
                    ? "!text-[var(--violet)] !border-[rgba(167,139,250,0.45)]"
                    : ""
                }`}
              >
                entry paid · {fmtUsd(game.lastPayment.amountUsd)}
                {game.lastPayment.method === "gf"
                  ? ` in ${RULES.token.symbol} (−${RULES.token.discount * 100}%)`
                  : " usdc"}
              </span>
            )}
          </div>
        </div>
      </main>

      <GameOverlays />
    </div>
  );
}
