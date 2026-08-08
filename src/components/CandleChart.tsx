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
  const [frameLoaded, setFrameLoaded] = useState(false);

  // the load event is best-effort ONLY: if it's missed (fast cache, event
  // fired before React attached), the chart must still appear — otherwise it
  // sits loaded at opacity 0 until the user clicks away and back
  useEffect(() => {
    if (typeof chartPair !== "string" || frameLoaded) return;
    const t = setTimeout(() => setFrameLoaded(true), 2000);
    return () => clearTimeout(t);
  }, [chartPair, frameLoaded]);

  // give the browser a head start on dexscreener's origin
  useEffect(() => {
    if (document.querySelector('link[data-ds-preconnect]')) return;
    for (const href of ["https://dexscreener.com", "https://io.dexscreener.com"]) {
      const l = document.createElement("link");
      l.rel = "preconnect";
      l.href = href;
      l.setAttribute("data-ds-preconnect", "1");
      document.head.appendChild(l);
    }
  }, []);

  useEffect(() => {
    if (!mint) {
      setChartPair(pairAddress || null);
      return;
    }
    let stop = false;
    setChartPair(undefined);
    setFrameLoaded(false);
    // remember resolutions: switching back to a token must be instant
    const cacheKey = `dsPair:${mint}`;
    try {
      const hit = sessionStorage.getItem(cacheKey);
      if (hit && hit !== "none") {
        setChartPair(hit);
        return;
      }
    } catch {
      /* private mode */
    }
    // a transient API failure must not paint "no chart" — retry twice
    (async () => {
      for (let attempt = 0; attempt < 3 && !stop; attempt++) {
        try {
          const r = await fetch(`/api/token/${mint}`);
          if (r.ok) {
            const j = await r.json();
            const pair = j?.chartPair ?? null;
            if (!stop) {
              setChartPair(pair ?? pairAddress ?? null);
              // only remember REAL pairs — caching a transient null would
              // stick a broken chart for the whole session
              if (pair) {
                try {
                  sessionStorage.setItem(cacheKey, pair);
                } catch {
                  /* fine */
                }
              }
            }
            return;
          }
        } catch {
          /* retry */
        }
        await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      }
      if (!stop) setChartPair(pairAddress || null);
    })();
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
          <>
            {!frameLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="mono text-xs text-[var(--ink-3)] animate-pulse">
                  loading live chart…
                </span>
              </div>
            )}
            <iframe
              key={chartPair}
              src={`https://dexscreener.com/solana/${chartPair}?embed=1&theme=light&chartTheme=light&trades=0&info=0`}
              className="absolute inset-0 w-full h-full border-0"
              style={{ opacity: frameLoaded ? 1 : 0, transition: "opacity 250ms ease" }}
              onLoad={() => setFrameLoaded(true)}
              allow="clipboard-write"
              allowFullScreen
            />
          </>
        )}
      </div>
    </div>
  );
}
