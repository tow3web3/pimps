"use client";

// The hero backdrop, terminal edition: no shaders, no gradients — a live tape
// of real pump.fun prices scrolling across a flat black surface. The market
// itself is the decoration.

import { useEffect, useState } from "react";
import type { TokenInfo } from "@/lib/types";

export default function HeroCanvas() {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);

  useEffect(() => {
    let stop = false;
    fetch("/api/tokens")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!stop && j?.tokens) setTokens(j.tokens.slice(0, 24));
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);

  const Tape = () =>
    tokens.length === 0 ? null : (
      <div className="overflow-hidden border-y border-[var(--border)] py-2 bg-[rgba(10,10,9,0.85)]">
        <div className="tape-track">
          {[0, 1].map((copy) => (
            <span key={copy} className="inline-flex">
              {tokens.map((t) => (
                <span
                  key={`${copy}-${t.mint}`}
                  className="mono text-[11px] inline-flex items-center gap-1.5 px-4 border-r border-[var(--border)]"
                >
                  <span className="text-[var(--amber)]">{t.symbol}</span>
                  <span className="text-[var(--ink-2)]">
                    ${t.priceUsd < 0.001 ? t.priceUsd.toPrecision(2) : t.priceUsd.toFixed(4)}
                  </span>
                  <span className={t.chg24h >= 0 ? "text-up" : "text-down"}>
                    {t.chg24h >= 0 ? "▲" : "▼"}
                    {Math.abs(t.chg24h).toFixed(1)}%
                  </span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    );

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* structural rules — the page reads as a built instrument, not a poster */}
      <div className="absolute inset-y-0 left-6 md:left-10 w-px bg-[var(--border)]" />
      <div className="absolute inset-y-0 right-6 md:right-10 w-px bg-[var(--border)]" />
      <div className="absolute top-16 inset-x-0 h-px bg-[var(--border)]" />

      {/* oversized watermark, outlined, barely there */}
      <div
        className="absolute -bottom-8 left-1/2 -translate-x-1/2 mono font-bold select-none whitespace-nowrap"
        style={{
          fontSize: "clamp(120px, 26vw, 340px)",
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: "1px rgba(233,231,221,0.06)",
        }}
      >
        $300
      </div>

      {/* the live tape */}
      <div className="absolute inset-x-0 bottom-24 md:bottom-28">
        <Tape />
      </div>
    </div>
  );
}
