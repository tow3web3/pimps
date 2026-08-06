"use client";

// The one decoration that can't be faked: a marquee of real pump.fun prices,
// refreshed live. Ink band on paper pages, hairline band on the desk.

import { useEffect, useState } from "react";
import type { TokenInfo } from "@/lib/types";

export default function LiveTape({ className = "" }: { className?: string }) {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch("/api/tokens")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!stop && j?.tokens?.length) setTokens(j.tokens.slice(0, 24));
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, []);

  if (tokens.length === 0) return null;

  return (
    <div className={`band border-y-2 border-[#131110] overflow-hidden py-2.5 ${className}`}>
      <div className="tape-track">
        {[0, 1].map((copy) => (
          <span key={copy} className="inline-flex items-center">
            {tokens.map((t) => (
              <span
                key={`${copy}-${t.mint}`}
                className="inline-flex items-center gap-2 px-5 border-r border-[rgba(242,239,230,0.2)]"
              >
                <span
                  className="text-[12px] font-bold tracking-tight"
                  style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
                >
                  {t.symbol}
                </span>
                <span className="mono text-[11px] text-[rgba(242,239,230,0.65)]">
                  ${t.priceUsd < 0.001 ? t.priceUsd.toPrecision(2) : t.priceUsd.toFixed(4)}
                </span>
                <span
                  className={`mono text-[11px] ${t.chg24h >= 0 ? "text-[#2be08f]" : "text-[#ff7b6b]"}`}
                >
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
}
