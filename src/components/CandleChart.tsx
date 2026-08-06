"use client";

// The chart IS DexScreener — embedded whole, their real-time candles down to
// the 1s interval. The pair is resolved through DexScreener's own API (their
// embed only renders THEIR pairs; a pool address from anywhere else can leave
// it blank), and when they simply don't chart a token we say so instead of
// showing a dead iframe. Your entry lives on a strip pinned above the chart.

import { useEffect, useState } from "react";
import { fmtUsd } from "@/lib/format";

export default function CandleChart({
  pairAddress,
  mint,
  livePriceUsd,
  avgEntryUsd,
}: {
  pairAddress: string;
  mint?: string;
  livePriceUsd?: number;
  /** the qty-weighted USD fill price, pinned at buy time */
  avgEntryUsd?: number;
}) {
  // undefined = resolving · null = dexscreener has no chart · string = pair
  const [chartPair, setChartPair] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!mint) {
      setChartPair(pairAddress || null);
      return;
    }
    let stop = false;
    setChartPair(undefined);
    fetch(`/api/token/${mint}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!stop) setChartPair(j?.chartPair ?? pairAddress ?? null);
      })
      .catch(() => {
        if (!stop) setChartPair(pairAddress || null);
      });
    return () => {
      stop = true;
    };
  }, [mint, pairAddress]);

  const entryPct =
    avgEntryUsd && avgEntryUsd > 0 && livePriceUsd && livePriceUsd > 0
      ? ((livePriceUsd - avgEntryUsd) / avgEntryUsd) * 100
      : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {avgEntryUsd && avgEntryUsd > 0 && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--border)]">
          <span className="panel-title">your entry</span>
          <span className="mono text-[12px] font-medium">{fmtUsd(avgEntryUsd)}</span>
          {entryPct !== null && (
            <span className={`mono text-[12px] ${entryPct >= 0 ? "text-up" : "text-down"}`}>
              {entryPct >= 0 ? "▲" : "▼"} {Math.abs(entryPct).toFixed(1)}% since fill
            </span>
          )}
          <span className="panel-title ml-auto">fills settle on dexscreener marks</span>
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        {chartPair === undefined && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="mono text-xs text-[var(--ink-3)] animate-pulse">
              resolving chart…
            </span>
          </div>
        )}
        {chartPair === null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <span className="mono text-xs text-[var(--ink-3)]">
              dexscreener has no chart for this token yet
            </span>
            <a
              href={`https://dexscreener.com/solana/${mint ?? pairAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="chip hover:!border-[var(--ink)] transition-colors"
            >
              open on dexscreener ↗
            </a>
          </div>
        )}
        {typeof chartPair === "string" && (
          <iframe
            key={chartPair}
            src={`https://dexscreener.com/solana/${chartPair}?embed=1&theme=light&chartTheme=light&trades=0&info=0`}
            className="absolute inset-0 w-full h-full border-0"
            allow="clipboard-write"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
