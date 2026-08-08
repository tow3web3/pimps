"use client";

import Link from "next/link";
import { useState } from "react";
import { useGame } from "@/lib/store";
import { attachPayoutWallet, useAuth } from "@/lib/authClient";
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
        <div className="overlay-card glass max-w-md w-full mx-4 p-8 text-center !border-[rgba(255,90,0,0.35)]">
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

  // a challenge was just secured — one loud moment, then straight back to work
  if (game.justCleared && game.status === "active") {
    const clearedNum = game.justCleared; // 1-based
    const next = RULES.phases[game.phase];
    const prize =
      game.tier === "free" ? RULES.freeRewardUsd : RULES.entryFeeUsd * RULES.fundedMultiple;
    return (
      <div className="overlay">
        <div className="overlay-card glass max-w-md w-full mx-4 p-8 text-center !border-[rgba(0,214,143,0.5)]">
          <p className="panel-title !text-[var(--up)]">challenge 0{clearedNum} cleared ✓</p>
          <h2 className="mono text-3xl font-bold mt-3 text-up">
            {clearedNum} / {RULES.phases.length} DOWN
          </h2>
          <p className="mono text-xs text-[var(--ink-2)] mt-4 leading-relaxed">
            pass secured at market. your stack resets to {RULES.startBalance} SOL for{" "}
            <b className="text-[var(--ink)]">challenge 0{next?.num}</b> — target {next?.gainLabel} (
            {RULES.startBalance} → {next?.target} SOL), same floor, {RULES.minTrades} fills
            minimum.
          </p>
          <p className="mono text-[12px] mt-4 text-[var(--heat-deep)] font-bold">
            {RULES.phases.length - clearedNum === 1
              ? `one challenge left between you and $${prize}`
              : `${RULES.phases.length - clearedNum} challenges left to the $${prize}`}
          </p>
          <button
            onClick={() => game.dismissCleared()}
            className="btn btn-buy w-full py-3.5 mt-6"
          >
            start challenge 0{next?.num} ▸
          </button>
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
        <div className="overlay-card glass max-w-lg w-full mx-4 p-10 text-center !border-[rgba(0,214,143,0.5)]">
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
                : "payout fires automatically — usually in your wallet within minutes"}
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
          <AttachWallet paid={paid} />
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

/** email accounts won without a wallet — this is where the money learns
    its destination */
function AttachWallet({ paid }: { paid: boolean }) {
  const acct = useAuth((s) => s.wallet);
  const [addr, setAddr] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState("");

  if (!acct?.startsWith("em:") || paid) return null;

  const save = async () => {
    setState("saving");
    try {
      await attachPayoutWallet(addr.trim());
      setState("saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not save");
      setState("error");
    }
  };

  return (
    <div className="rounded-xl border border-[rgba(255,90,0,0.4)] px-4 py-3 mt-3 text-left">
      <p className="mono text-[11px] text-[var(--heat-deep)]">
        you played with an email account — add the Solana wallet that should receive the money
      </p>
      {state === "saved" ? (
        <p className="mono text-[11px] text-up mt-2">
          ✓ wallet saved — the payout goes there after the safety window
        </p>
      ) : (
        <>
          <div className="flex gap-2 mt-2">
            <input
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="your Solana address"
              className="field !text-[12px] !py-2 flex-1"
            />
            <button
              onClick={save}
              disabled={state === "saving" || addr.trim().length < 32}
              className="btn btn-cyan !px-4 shrink-0"
            >
              {state === "saving" ? "…" : "save"}
            </button>
          </div>
          {state === "error" && <p className="mono text-[10px] text-down mt-1.5">✕ {err}</p>}
        </>
      )}
    </div>
  );
}
