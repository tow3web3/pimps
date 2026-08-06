"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarket, useMarketFeed } from "@/lib/market";
import { useGame } from "@/lib/store";
import TopBar from "@/components/TopBar";
import TokenList from "@/components/TokenList";
import ChartHeader from "@/components/ChartHeader";
import CandleChart from "@/components/CandleChart";
import TradePanel from "@/components/TradePanel";
import PositionsPanel from "@/components/PositionsPanel";
import ChallengeHUD from "@/components/ChallengeHUD";
import GameOverlays from "@/components/GameOverlays";
import MobileTradeBar from "@/components/MobileTradeBar";
import MobileChallengeBar from "@/components/MobileChallengeBar";
import LiveFeed, { FeedToasts } from "@/components/LiveFeed";
import TokenInfoPanel from "@/components/TokenInfoPanel";

type Tab = "market" | "chart" | "info" | "stats" | "tape";

export default function TerminalPage() {
  useMarketFeed();
  const { tokens, selected } = useMarket();
  const positions = useGame((s) => s.positions);
  const token = selected ? tokens[selected] : undefined;

  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("chart");
  useEffect(() => setMounted(true), []);

  // the entry line the chart draws: the USD price AT FILL TIME, pinned —
  // converting the sol average at today's ratio would drift with SOL/USD
  const avgEntryUsd = useMemo(() => {
    if (!token) return undefined;
    const p = positions.find((x) => x.mint === token.mint);
    if (!p) return undefined;
    if (p.avgPriceUsd > 0) return p.avgPriceUsd;
    return token.priceSol > 0 ? p.avgPriceSol * (token.priceUsd / token.priceSol) : undefined;
  }, [token, positions]);

  if (!mounted) {
    return (
      <div className="paper h-dvh flex items-center justify-center">
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
          <CandleChart
            pairAddress={token.pairAddress}
            mint={token.mint}
            livePriceUsd={token.priceUsd}
            avgEntryUsd={avgEntryUsd}
          />
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
    <div className="paper h-dvh flex flex-col">
      <TopBar />

      {/* ── desktop ── */}
      <main className="hidden lg:grid flex-1 min-h-0 grid-cols-[250px_minmax(0,1fr)_320px] gap-3 p-3">
        <div className="flex flex-col gap-3 min-h-0">
          <div className="flex-1 min-h-0 flex flex-col">
            <TokenList />
          </div>
          <div className="h-[240px] shrink-0 flex flex-col min-h-0">
            <LiveFeed />
          </div>
        </div>
        <div className="flex flex-col gap-3 min-h-0">
          {chartPanel}
          <div className="h-[230px] shrink-0 flex flex-col min-h-0">
            <PositionsPanel />
          </div>
        </div>
        {/* trade first, and every panel shrink-0: in a fixed-height flex
            column the panels otherwise COMPRESS instead of scrolling, and
            overflow-hidden silently clips the buy button off the bottom */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
          <div className="shrink-0">
            <TradePanel />
          </div>
          <div className="shrink-0">
            <ChallengeHUD />
          </div>
          {token && (
            <div className="shrink-0">
              <TokenInfoPanel mint={token.mint} />
            </div>
          )}
        </div>
      </main>

      {/* ── mobile: chart fills the screen, trading never leaves it ── */}
      <div className="lg:hidden px-2 pt-2">
        <MobileChallengeBar onOpen={() => setTab("stats")} />
      </div>
      <main
        className={`lg:hidden flex-1 min-h-0 flex flex-col p-2 gap-2 ${
          tab === "chart" ? "pb-[86px]" : "pb-2"
        }`}
      >
        {tab === "market" && (
          <div className="flex-1 min-h-0 flex flex-col">
            <TokenList onPick={() => setTab("chart")} />
          </div>
        )}
        {tab === "chart" && (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            {/* the chart can never be squeezed to zero: it keeps a real
                height and the tab scrolls instead */}
            <div className="flex-1 min-h-[440px] flex flex-col">{chartPanel}</div>
          </div>
        )}
        {tab === "info" && (
          <div className="flex-1 min-h-0 flex flex-col">
            {token ? (
              <TokenInfoPanel mint={token.mint} />
            ) : (
              <p className="mono text-xs text-[var(--ink-3)] p-6 text-center">select a token</p>
            )}
          </div>
        )}
        {tab === "stats" && (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
            <div className="shrink-0">
              <ChallengeHUD />
            </div>
            <div className="h-[260px] shrink-0 flex flex-col min-h-0">
              <PositionsPanel />
            </div>
          </div>
        )}
        {tab === "tape" && (
          <div className="flex-1 min-h-0 flex flex-col">
            <LiveFeed />
          </div>
        )}
      </main>

      {tab === "chart" && <MobileTradeBar />}

      <nav className="lg:hidden shrink-0 grid grid-cols-5 border-t border-[var(--border)] bg-[var(--panel-solid)] z-40">
        {(
          [
            ["market", "◧", "markets"],
            ["chart", "◪", "trade"],
            ["info", "ⓘ", "info"],
            ["stats", "◫", "stats"],
            ["tape", "▤", "tape"],
          ] as const
        ).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
              tab === id
                ? "text-[var(--cyan)] bg-[rgba(255,90,0,0.07)]"
                : "text-[var(--ink-3)]"
            }`}
          >
            <span className="text-[15px] leading-none">{icon}</span>
            <span className="mono text-[9px] tracking-[0.08em] uppercase">{label}</span>
          </button>
        ))}
      </nav>

      <FeedToasts />
      <GameOverlays />
    </div>
  );
}
