"use client";

import { useGame } from "@/lib/store";
import { RULES } from "@/lib/rules";
import { fmtPct, fmtSol } from "@/lib/format";

// A slim always-visible progress strip for phones: where you are in the
// current challenge, how close to the target, and how much buffer is left
// before the floor. Tapping it opens the full stats.
export default function MobileChallengeBar({ onOpen }: { onOpen: () => void }) {
  const game = useGame();
  if (game.status !== "active") return null;

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
  const danger = buffer <= 0.25;

  return (
    <button
      onClick={onOpen}
      className="lg:hidden w-full glass !rounded-xl px-3 py-2 flex flex-col gap-1.5 active:opacity-80"
    >
      <div className="flex items-center gap-2">
        <span className="mono text-[10px] tracking-[0.15em] text-[var(--cyan)]">
          CH 0{phase.num}
        </span>
        <span className="mono text-[10px] text-[var(--ink-3)]">{phase.gainLabel}</span>
        <span className="mono text-[11px] ml-auto">
          {fmtSol(game.equity, 2)} <span className="text-[var(--ink-3)]">/ {target} SOL</span>
        </span>
        <span className={`mono text-[10px] ${returnPct >= 0 ? "text-up" : "text-down"}`}>
          {fmtPct(returnPct, 0)}
        </span>
        <span className="text-[var(--ink-3)] text-[11px] leading-none">›</span>
      </div>
      {/* target progress */}
      <div className="meter !h-1.5">
        <div
          className="meter-fill"
          style={{
            width: `${progress * 100}%`,
            background: "linear-gradient(90deg, var(--cyan), var(--violet))",
          }}
        />
      </div>
      {/* buffer to the floor — only surfaces when it matters */}
      {danger && (
        <div className="flex items-center gap-1.5">
          <span className="mono text-[9px] text-down">
            ⚠ buffer {fmtSol(Math.max(0, game.equity - RULES.failFloor), 2)} SOL to floor
          </span>
          <div className="meter !h-1 flex-1">
            <div className="meter-fill" style={{ width: `${buffer * 100}%`, background: "var(--down)" }} />
          </div>
        </div>
      )}
    </button>
  );
}
