"use client";

// The chart IS DexScreener — embedded whole, their real-time candles down to
// the 1s interval. Our fills settle on the same DexScreener marks the chart
// draws, so what you see is what you pay. The one thing their iframe can't
// show is YOUR entry, so it lives on a strip pinned above the chart.

import { fmtUsd } from "@/lib/format";

export default function CandleChart({
  pairAddress,
  mint,
  livePriceUsd,
  avgEntryUsd,
}: {
  pairAddress: string;
  /** embed by MINT when available: DexScreener resolves it to their own top
      pair, so a migrated/stale pool can never leave the chart blank */
  mint?: string;
  livePriceUsd?: number;
  /** the qty-weighted USD fill price, pinned at buy time */
  avgEntryUsd?: number;
}) {
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
            <span
              className={`mono text-[12px] ${entryPct >= 0 ? "text-up" : "text-down"}`}
            >
              {entryPct >= 0 ? "▲" : "▼"} {Math.abs(entryPct).toFixed(1)}% since fill
            </span>
          )}
          <span className="panel-title ml-auto">fills settle on dexscreener marks</span>
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        <iframe
          key={mint ?? pairAddress}
          src={`https://dexscreener.com/solana/${mint ?? pairAddress}?embed=1&theme=light&chartTheme=light&trades=0&info=0`}
          className="absolute inset-0 w-full h-full border-0"
          allow="clipboard-write"
          allowFullScreen
        />
      </div>
    </div>
  );
}
