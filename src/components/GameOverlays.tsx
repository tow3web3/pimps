"use client";

import Link from "next/link";
import { useGame } from "@/lib/store";
import { entryFeeGfUsd, fundedAccountUsd, RULES } from "@/lib/rules";
import { fmtSol, fmtUsd } from "@/lib/format";

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] px-4 py-3 text-center">
      <div className="panel-title">{label}</div>
      <div className={`mono text-lg mt-1 ${cls ?? ""}`}>{value}</div>
    </div>
  );
}

export default function GameOverlays() {
  const game = useGame();
  const last = game.history[game.history.length - 1];

  // server mode, wallet connected, no seat bought yet
  if (game.status === "unseated") {
    return (
      <div className="overlay">
        <div className="overlay-card glass max-w-md w-full mx-4 p-8 text-center !border-[rgba(255,176,0,0.35)]">
          <p className="panel-title !text-[var(--cyan)]">wallet connected</p>
          <h2 className="mono text-3xl font-bold mt-2">NO ACTIVE RUN</h2>
          <p className="mono text-xs text-[var(--ink-2)] mt-4 leading-relaxed">
            your account is live on the server — take a seat to start challenge 01. free roll
            available.
          </p>
          <Link href="/enter" className="btn btn-primary w-full py-3.5 mt-6 block">
            take a seat ▸
          </Link>
        </div>
      </div>
    );
  }

  if (game.status === "passed" && last) {
    const next = RULES.phases[game.phase + 1];
    return (
      <div className="overlay">
        <div className="overlay-card glass max-w-md w-full mx-4 p-8 text-center !border-[rgba(0,214,143,0.35)]">
          <p className="panel-title !text-[var(--up)]">objective secured</p>
          <h2
            className="glitch mono text-3xl font-bold mt-2 text-[var(--up)]"
            data-text={`CHALLENGE 0${last.phase} CLEARED`}
          >
            CHALLENGE 0{last.phase} CLEARED
          </h2>
          <div className="grid grid-cols-2 gap-2 mt-6">
            <Stat label="final equity" value={`${fmtSol(last.finalEquity, 2)} SOL`} cls="text-up" />
            <Stat label="fills" value={String(last.trades)} />
          </div>
          {next && (
            <>
              <p className="mono text-xs text-[var(--ink-2)] mt-6 leading-relaxed">
                next: challenge 0{next.num} — grow a fresh {RULES.startBalance} SOL stack by{" "}
                <span className="text-[var(--cyan)]">{next.gainLabel}</span> to{" "}
                {fmtSol(next.target, 0)} SOL. same floor, same rules, higher bar.
              </p>
              <button
                onClick={() => useGame.getState().startNextPhase()}
                className="btn btn-primary w-full py-3.5 mt-6"
              >
                enter challenge 0{next.num} ▸
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (game.status === "failed") {
    return (
      <div className="overlay">
        <div className="overlay-card glass max-w-md w-full mx-4 p-8 text-center !border-[rgba(255,82,82,0.4)]">
          <p className="panel-title !text-[var(--down)]">
            {game.failReason === "expired" ? "clock expired" : "drawdown breached"}
          </p>
          <h2
            className="glitch mono text-3xl font-bold mt-2 text-[var(--down)]"
            data-text="CHALLENGE FAILED"
          >
            CHALLENGE FAILED
          </h2>
          <p className="mono text-xs text-[var(--ink-2)] mt-4 leading-relaxed">
            {game.failReason === "expired"
              ? `the ${RULES.challengeDays}-day window closed before the target.`
              : `equity fell below ${fmtSol(RULES.failFloor, 2)} SOL — the ${
                  (1 - RULES.failFloor / RULES.startBalance) * 100
                }% max drawdown.`}{" "}
            the entry fee is burned. that is the whole downside — nothing else was ever at risk.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-6">
            <Stat label="final equity" value={`${fmtSol(game.equity, 2)} SOL`} cls="text-down" />
            <Stat label="attempt" value={`#${game.attempt}`} />
          </div>
          <Link href="/enter" className="btn btn-cyan w-full py-3.5 mt-6 block">
            new attempt — {fmtUsd(RULES.entryFeeUsd)} · {fmtUsd(entryFeeGfUsd())} in{" "}
            {RULES.token.symbol}
          </Link>
          <p className="mono text-[10px] text-[var(--ink-3)] mt-3">
            restarts from challenge 01 · payment is mocked in this build
          </p>
        </div>
      </div>
    );
  }

  if (game.status === "funded") {
    const isFree = game.tier === "free";
    const reward = game.prize?.usd ?? (isFree ? RULES.freeRewardUsd : fundedAccountUsd());
    const status = game.prize?.status ?? "pending";
    const paid = status === "paid";
    return (
      <div className="overlay">
        <div className="overlay-card glass max-w-lg w-full mx-4 p-10 text-center !border-[rgba(0,214,143,0.5)] shadow-[0_0_80px_rgba(0,214,143,0.2)]">
          <p className="panel-title !text-[var(--up)]">
            all three challenges cleared{isFree ? " · free roll" : ""}
          </p>
          <h2
            className="glitch gradient-text mono text-4xl font-bold mt-3"
            data-text={`YOU WON ${fmtUsd(reward)}`}
          >
            YOU WON {fmtUsd(reward)}
          </h2>
          <p className="mono text-xs text-[var(--ink-2)] mt-5 leading-relaxed">
            you cleared {RULES.phases.map((p) => p.gainLabel).join(", ")} without ever breaking the
            floor. the firm is sending {fmtUsd(reward)} straight to your Phantom.
          </p>
          <div className="rounded-xl border border-[rgba(0,214,143,0.3)] px-4 py-3 mt-6">
            <div className="flex items-center justify-center gap-2">
              <span className={paid ? "text-up" : "text-[var(--amber)]"}>
                {paid ? "✓" : "⏳"}
              </span>
              <span className="mono text-sm">
                {paid ? `${fmtUsd(reward)} sent` : `${fmtUsd(reward)} — payout queued`}
              </span>
            </div>
            <p className="mono text-[10px] text-[var(--ink-3)] mt-1.5">
              {paid
                ? "usdc delivered to your wallet"
                : "paid automatically to your wallet after a 24h safety window"}
            </p>
            {game.prize?.txSig && (
              <a
                href={`https://solscan.io/tx/${game.prize.txSig}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mono text-[10px] text-[var(--cyan)] hover:underline mt-1 inline-block"
              >
                view transaction ↗
              </a>
            )}
          </div>
          <p className="mono text-[10px] text-[var(--ink-3)] mt-4">
            {RULES.fundedMultiple}x your {fmtUsd(RULES.entryFeeUsd)} entry · payouts are simulated in
            this preview build
          </p>
          <div className="flex gap-2 mt-6">
            <Link href="/enter" className="btn btn-primary flex-1 py-3.5">
              play again
            </Link>
            <Link href="/dashboard" className="btn flex-1 py-3.5">
              dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
