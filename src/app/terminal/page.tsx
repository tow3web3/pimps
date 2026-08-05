"use client";

import { useEffect, useState } from "react";
import { useMarket, useMarketFeed } from "@/lib/market";
import TopBar from "@/components/TopBar";
import TokenList from "@/components/TokenList";
import ChartHeader from "@/components/ChartHeader";
import CandleChart from "@/components/CandleChart";
import TradePanel from "@/components/TradePanel";
import PositionsPanel from "@/components/PositionsPanel";
import ChallengeHUD from "@/components/ChallengeHUD";
import GameOverlays from "@/components/GameOverlays";

type Tab = "market" | "chart" | "trade";

export default function TerminalPage() {
  useMarketFeed();
  const { tokens, selected } = useMarket();
  const token = selected ? tokens[selected] : undefined;

  // avoid a hydration mismatch with the persisted game store
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("chart");
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <span className="mono text-xs tracking-[0.3em] text-[var(--ink-3)] animate-pulse">
          BOOTING TERMINAL…
        </span>
      </div>
    );
  }

  const chartPanel = (
    <div className="glass flex-1 flex flex-col min-h-0 overflow-hidden">
      {token ? (
        <>
          <ChartHeader token={token} />
          <CandleChart pairAddress={token.pairAddress} livePriceUsd={token.priceUsd} />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <span className="mono text-xs tracking-[0.25em] text-[var(--ink-3)] animate-pulse">
            LOADING MARKETS…
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-dvh flex flex-col">
      <TopBar />

      {/* ── desktop: three columns ── */}
      <main className="hidden lg:grid flex-1 min-h-0 grid-cols-[250px_minmax(0,1fr)_320px] gap-3 p-3">
        <div className="flex flex-col min-h-0">
          <TokenList />
        </div>
        <div className="flex flex-col gap-3 min-h-0">
          {chartPanel}
          <div className="h-[230px] shrink-0 flex flex-col min-h-0">
            <PositionsPanel />
          </div>
        </div>
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
          <ChallengeHUD />
          <TradePanel />
        </div>
      </main>

      {/* ── mobile / tablet: one pane at a time, switched from the bottom bar ── */}
      <main className="lg:hidden flex-1 min-h-0 flex flex-col p-2 gap-2">
        {tab === "market" && (
          <div className="flex-1 min-h-0 flex flex-col">
            <TokenList />
          </div>
        )}
        {tab === "chart" && (
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            {chartPanel}
            <div className="h-[190px] shrink-0 flex flex-col min-h-0">
              <PositionsPanel />
            </div>
          </div>
        )}
        {tab === "trade" && (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
            <ChallengeHUD />
            <TradePanel />
          </div>
        )}
      </main>

      <nav className="lg:hidden shrink-0 grid grid-cols-3 border-t border-[var(--border)] bg-[var(--panel-solid)]">
        {(
          [
            ["market", "◧ markets"],
            ["chart", "◪ chart"],
            ["trade", "◈ trade"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`mono text-[11px] tracking-[0.12em] uppercase py-3.5 transition-colors ${
              tab === id
                ? "text-[var(--cyan)] bg-[rgba(34,211,238,0.07)] border-t-2 border-[var(--cyan)] -mt-[2px]"
                : "text-[var(--ink-3)]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <GameOverlays />
    </div>
  );
}
