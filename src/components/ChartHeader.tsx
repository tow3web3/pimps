"use client";

import { useEffect, useRef, useState } from "react";
import { fmtCompact, fmtPct, fmtSol, fmtUsd } from "@/lib/format";
import type { TokenInfo } from "@/lib/types";
import { TokenIcon } from "./TokenList";
import CopyButton from "./CopyButton";

export default function ChartHeader({ token }: { token: TokenInfo }) {
  const prev = useRef(token.priceUsd);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (token.priceUsd === prev.current) return;
    setFlash(token.priceUsd > prev.current ? "up" : "down");
    prev.current = token.priceUsd;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [token.priceUsd]);

  const stats: Array<{ label: string; value: string; cls?: string }> = [
    { label: "mcap", value: fmtCompact(token.mcapUsd) },
    { label: "liquidity", value: fmtCompact(token.liqUsd) },
    { label: "vol 24h", value: fmtCompact(token.vol24Usd) },
    { label: "1h", value: fmtPct(token.chg1h, 1), cls: token.chg1h >= 0 ? "text-up" : "text-down" },
    {
      label: "24h",
      value: fmtPct(token.chg24h, 1),
      cls: token.chg24h >= 0 ? "text-up" : "text-down",
    },
  ];

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border)] flex-wrap">
      <div className="flex items-center gap-2.5 min-w-0">
        <TokenIcon url={token.imageUrl} symbol={token.symbol} size={34} />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="mono font-semibold text-[15px]">{token.symbol}</span>
            <span className="text-xs text-[var(--ink-3)] truncate max-w-[140px]">{token.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="mono text-[10px] text-[var(--ink-3)]">
              {token.mint.slice(0, 4)}…{token.mint.slice(-4)}
            </span>
            <CopyButton value={token.mint} label="CA" className="!text-[10px]" />
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <div
          className={`mono text-xl font-semibold leading-tight ${
            flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : ""
          }`}
        >
          {fmtUsd(token.priceUsd)}
        </div>
        <div className="mono text-[10px] text-[var(--ink-3)]">
          {fmtSol(token.priceSol, 9)} SOL
        </div>
      </div>

      <div className="flex items-center gap-4 ml-auto flex-wrap">
        {stats.map((s) => (
          <div key={s.label} className="text-right">
            <div className="panel-title">{s.label}</div>
            <div className={`mono text-[12px] ${s.cls ?? ""}`}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
