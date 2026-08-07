"use client";

// The house rules, full screen, before the first trade — big type, one idea
// per line, impossible to misread. Shows once per browser; the TopBar "rules"
// chip brings it back any time.

import { useEffect } from "react";
import { create } from "zustand";
import { fundedAccountUsd, RULES } from "@/lib/rules";
import { useGame } from "@/lib/store";

const SEEN_KEY = "gf_rules_seen";

export const useRulesGate = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export default function RulesGate() {
  const { open, setOpen } = useRulesGate();
  const tier = useGame((s) => s.tier);
  const prize = tier === "free" ? RULES.freeRewardUsd : fundedAccountUsd();

  // first visit: the rules come to you
  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== "1") setOpen(true);
    } catch {
      /* private mode: just don't auto-open */
    }
  }, [setOpen]);

  if (!open) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* fine */
    }
    setOpen(false);
  };

  const rows: Array<{ k: string; big: string; d: string }> = [
    {
      k: "the mission",
      big: `${RULES.phases.map((p) => p.gainLabel).join(" → ")}`,
      d: `three challenges, ${RULES.startBalance} SOL each. clear all three → you get paid $${prize}, cash.`,
    },
    {
      k: "the floor",
      big: `never under ${RULES.failFloor} SOL`,
      d: "equity below the floor ends the run instantly — checked on every price tick.",
    },
    {
      k: "the cap",
      big: `max ${RULES.maxExposure * 100}% per token`,
      d: "of your bag, at entry. no all-in coin-flips.",
    },
    {
      k: "the grind",
      big: `${RULES.minTrades} trades minimum`,
      d: "per challenge — one lucky ape doesn't make a trader.",
    },
    {
      k: "the meter",
      big: `${RULES.feeRate * 100}% fee · ${RULES.challengeDays} days`,
      d: "every fill pays the fee like the real venue, and each challenge expires.",
    },
  ];

  return (
    <div className="overlay !z-[70]">
      <div className="overlay-card w-full max-w-2xl mx-3 max-h-[92dvh] overflow-y-auto rounded-[6px] border-2 border-[var(--ink)] bg-[var(--bg)] shadow-[6px_6px_0_var(--heat)]">
        <div className="px-6 md:px-10 py-8">
          <p className="mono text-[11px] tracking-[0.3em] uppercase text-[var(--heat-deep)]">
            house rules — read once, they never move
          </p>
          <h2 className="display text-[clamp(30px,6vw,44px)] mt-2">
            Five rules between you and the ${prize}.
          </h2>

          <div className="mt-6">
            {rows.map((r, i) => (
              <div
                key={r.k}
                className="grid grid-cols-[36px_1fr] gap-x-4 border-t-2 border-[var(--ink)] py-4 items-start"
              >
                <span className="display text-[26px] text-[var(--ink-3)] leading-none mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="display text-[clamp(20px,4vw,28px)] leading-tight">
                      {r.big}
                    </span>
                    <span className="mono text-[10px] tracking-[0.2em] uppercase text-[var(--heat-deep)]">
                      {r.k}
                    </span>
                  </div>
                  <p className="text-[14px] text-[var(--ink-2)] mt-1 leading-relaxed">{r.d}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mono text-[11px] text-[var(--ink-2)] border-t-2 border-[var(--ink)] pt-4 mt-0 leading-relaxed">
            prices are live pump.fun · your {RULES.startBalance} SOL stack is simulated · the $
            {prize} is real — sent straight to your wallet
          </p>

          <button onClick={dismiss} className="btn-heat w-full !py-4 mt-6">
            got it — take the desk <span className="btn-arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
