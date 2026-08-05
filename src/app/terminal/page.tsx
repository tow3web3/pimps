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

export default function TerminalPage() {
  useMarketFeed();
  const { tokens, selected } = useMarket();
  const token = selected ? tokens[selected] : undefined;

  // avoid a hydration mismatch with the persisted game store
  const [mounted, setMounted] = useState(false);
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

  return (
    <div className="h-dvh flex flex-col">
      <TopBar />

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_320px] gap-3 p-3">
        {/* left — the eligible universe */}
        <div className="hidden lg:flex flex-col min-h-0">
          <TokenList />
        </div>

        {/* center — chart + book */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="glass flex-1 flex flex-col min-h-0 overflow-hidden">
            {token ? (
              <>
                <ChartHeader token={token} />
                <CandleChart pairAddress={token.pairAddress} livePriceUsd={token.priceUsd} />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <span className="mono text-xs tracking-[0.25em] text-[var(--ink-3)] animate-pulse">
                  SCANNING PUMP.FUN UNIVERSE…
                </span>
              </div>
            )}
          </div>
          <div className="h-[230px] shrink-0 flex flex-col min-h-0">
            <PositionsPanel />
          </div>
        </div>

        {/* right — mission control */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
          <ChallengeHUD />
          <TradePanel />
        </div>
      </main>

      <GameOverlays />
    </div>
  );
}
