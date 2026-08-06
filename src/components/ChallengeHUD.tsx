"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/lib/store";
import { useMarket } from "@/lib/market";
import { RULES } from "@/lib/rules";
import { fmtCountdown, fmtPct, fmtSol, fmtUsd } from "@/lib/format";

export default function ChallengeHUD() {
  const game = useGame();
  const { solUsd, tokens } = useMarket();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const phase = RULES.phases[game.phase];
  const target = phase.target;
  const returnPct = ((game.equity - RULES.startBalance) / RULES.startBalance) * 100;

  const progress = Math.max(
    0,
    Math.min(1, (game.equity - RULES.startBalance) / (target - RULES.startBalance)),
  );
  const buffer = Math.max(
    0,
    Math.min(1, (game.equity - RULES.failFloor) / (RULES.startBalance - RULES.failFloor)),
  );

  const bufferColor =
    buffer > 0.5 ? "linear-gradient(90deg, var(--cyan), var(--up))" : buffer > 0.25 ? "var(--amber)" : "var(--down)";

  const tradesOk = game.trades.length >= RULES.minTrades;
  const targetHit = game.equity >= target;
  const canPass = game.status === "active" && targetHit && tradesOk;

  return (
    <div className="glass overflow-hidden">
      {/* phase strip */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[rgba(255,90,0,0.03)]">
        <div className="flex items-center gap-2">
          <span className="mono text-xs tracking-[0.25em] text-[var(--cyan)]">
            CHALLENGE 0{phase.num}
          </span>
          <span className="mono text-[10px] text-[var(--ink-3)]">/ 03</span>
        </div>
        <div className="flex items-center gap-1.5">
          {RULES.phases.map((p, i) => (
            <span
              key={p.num}
              className={`w-5 h-1 rounded-full ${
                i < game.phase
                  ? "bg-[var(--up)]"
                  : i === game.phase
                    ? "bg-[var(--cyan)]"
                    : "bg-[rgba(19,17,16,0.15)]"
              }`}
            />
          ))}
          <span className="mono text-[10px] text-[var(--ink-3)] ml-1.5">att.{game.attempt}</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* equity */}
        <div>
          <div className="flex items-baseline justify-between">
            <span className="panel-title">equity · nlv</span>
            <span className={`mono text-[11px] ${returnPct >= 0 ? "text-up" : "text-down"}`}>
              {fmtPct(returnPct, 2)}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span
              className={`mono text-[28px] font-semibold leading-none ${
                game.equity >= RULES.startBalance
                  ? "text-[var(--ink)]"
                  : game.equity < RULES.failFloor + 0.5
                    ? "text-down"
                    : "text-[var(--ink)]"
              }`}
            >
              {fmtSol(game.equity, 3)}
            </span>
            <span className="mono text-xs text-[var(--ink-3)]">SOL</span>
            {solUsd > 0 && (
              <span className="mono text-[11px] text-[var(--ink-3)] ml-auto">
                ≈ {fmtUsd(game.equity * solUsd)}
              </span>
            )}
          </div>
        </div>

        {/* target progress */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="panel-title">
              target {phase.gainLabel} · pass at {fmtSol(target, 2)}
            </span>
            <span className="mono text-[10px] text-[var(--cyan)]">
              {(progress * 100).toFixed(0)}%
            </span>
          </div>
          <div className="meter">
            <div
              className={`meter-fill ${progress > 0.05 ? "shimmer" : ""}`}
              style={{
                width: `${progress * 100}%`,
                background: "linear-gradient(90deg, var(--cyan), var(--violet))",
              }}
            />
          </div>
        </div>

        {/* drawdown buffer */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="panel-title">buffer · fail below {fmtSol(RULES.failFloor, 2)}</span>
            <span
              className={`mono text-[10px] ${
                buffer > 0.5 ? "text-[var(--ink-2)]" : buffer > 0.25 ? "text-[var(--amber)]" : "text-down"
              }`}
            >
              {buffer <= 0.25 && game.status === "active" ? "⚠ " : ""}
              {fmtSol(Math.max(0, game.equity - RULES.failFloor), 2)} SOL
            </span>
          </div>
          <div className="meter">
            <div
              className="meter-fill"
              style={{ width: `${buffer * 100}%`, background: bufferColor }}
            />
          </div>
        </div>

        {/* trades + clock */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-[var(--border)] px-3 py-2">
            <div className="panel-title">trades</div>
            <div className="mono text-sm mt-0.5">
              <span className={tradesOk ? "text-up" : "text-[var(--ink)]"}>
                {game.trades.length}
              </span>
              <span className="text-[var(--ink-3)]"> / {RULES.minTrades} min</span>
              {tradesOk && <span className="text-up text-[10px]"> ✓</span>}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] px-3 py-2">
            <div className="panel-title">time left</div>
            <div className="mono text-sm mt-0.5">{fmtCountdown(game.endsAt - now)}</div>
          </div>
        </div>

        {/* the reason you're here — always visible while trading */}
        <div className="rounded-lg border border-[rgba(255,82,0,0.35)] px-3 py-2 flex items-baseline justify-between">
          <span className="panel-title !text-[var(--heat-deep)]">clear all 3</span>
          <span className="mono text-[13px] font-bold text-[var(--heat-deep)]">
            ${game.tier === "free" ? RULES.freeRewardUsd : RULES.entryFeeUsd * RULES.fundedMultiple} to your wallet
          </span>
        </div>

        {/* secure pass */}
        {canPass && (
          <button
            onClick={() => void Promise.resolve(useGame.getState().securePass(tokens))}
            className="btn btn-buy secure-pass w-full py-3.5 !text-[13px]"
          >
            ◆ secure pass — clear challenge 0{phase.num}
          </button>
        )}
        {game.status === "active" && targetHit && !tradesOk && (
          <p className="mono text-[10px] text-amber-300/90 border border-amber-300/25 rounded-lg px-2.5 py-1.5">
            target reached — {RULES.minTrades - game.trades.length} more trade
            {RULES.minTrades - game.trades.length > 1 ? "s" : ""} to qualify
          </p>
        )}
      </div>
    </div>
  );
}
