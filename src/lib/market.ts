"use client";

import { useEffect, useRef } from "react";
import { create } from "zustand";
import { useGame } from "./store";
import type { TokenInfo } from "./types";

interface MarketState {
  /** every token we know about, by mint */
  tokens: Record<string, TokenInfo>;
  /** eligible universe, mints sorted by 24h volume */
  universe: string[];
  solUsd: number;
  selected: string | null;
  lastTick: number;
  universeLoaded: boolean;
  /** which feed priced the last tick — helius kicks in when the key is set */
  source: "helius" | "dexscreener";
  select: (mint: string) => void;
}

export const useMarket = create<MarketState>((set) => ({
  tokens: {},
  universe: [],
  solUsd: 0,
  selected: null,
  lastTick: 0,
  universeLoaded: false,
  source: "dexscreener",
  select: (mint) => set({ selected: mint }),
}));

async function fetchUniverse() {
  const res = await fetch("/api/tokens");
  if (!res.ok) throw new Error("tokens fetch failed");
  const data: { tokens: TokenInfo[]; solUsd: number } = await res.json();
  // an empty answer means the upstream indexer hiccuped — keep what we have
  if (data.tokens.length === 0) return;
  useMarket.setState((s) => {
    const tokens = { ...s.tokens };
    for (const t of data.tokens) tokens[t.mint] = { ...tokens[t.mint], ...t };
    return {
      tokens,
      universe: data.tokens.map((t) => t.mint),
      solUsd: data.solUsd || s.solUsd,
      selected: s.selected ?? data.tokens[0]?.mint ?? null,
      universeLoaded: true,
    };
  });
}

async function fetchPrices() {
  const m = useMarket.getState();
  const game = useGame.getState();
  // priority for the fast lane (30-pair batch limit): open positions drive the
  // fail check, the selected token drives the chart, then the hottest of the
  // list — the long tail refreshes with the 90s universe sweep instead
  const pairs: string[] = [];
  const push = (p?: string) => {
    if (p && pairs.length < 30 && !pairs.includes(p)) pairs.push(p);
  };
  for (const p of game.positions) push(p.pairAddress);
  if (m.selected) push(m.tokens[m.selected]?.pairAddress);
  for (const mint of m.universe) {
    if (pairs.length >= 30) break;
    push(m.tokens[mint]?.pairAddress);
  }
  if (pairs.length === 0) return;

  const res = await fetch(`/api/prices?pairs=${pairs.join(",")}`);
  if (!res.ok) return;
  const data: { tokens: TokenInfo[]; solUsd: number; source?: "helius" | "dexscreener" } =
    await res.json();

  useMarket.setState((s) => {
    const tokens = { ...s.tokens };
    for (const t of data.tokens) tokens[t.mint] = { ...tokens[t.mint], ...t };
    return {
      tokens,
      solUsd: data.solUsd || s.solUsd,
      lastTick: Date.now(),
      source: data.source ?? "dexscreener",
    };
  });

  // mark the book to market and run the fail / target checks
  useGame.getState().markToMarket(useMarket.getState().tokens);
}

/**
 * Mount once in the terminal: universe refresh every 60s; price ticks self-pace —
 * 3s on the free DexScreener feed, 1.5s once Helius answers.
 */
export function useMarketFeed() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    fetchUniverse().catch(() => {});
    const loop = async () => {
      if (stopped) return;
      await fetchPrices().catch(() => {});
      if (stopped) return;
      timer = setTimeout(loop, useMarket.getState().source === "helius" ? 1_200 : 2_500);
    };
    loop();
    // fast retries until the first universe lands, then a slow 90s refresh
    let uniTimer: ReturnType<typeof setTimeout>;
    const uniLoop = () => {
      if (stopped) return;
      uniTimer = setTimeout(
        () => fetchUniverse().catch(() => {}).finally(uniLoop),
        useMarket.getState().universeLoaded ? 90_000 : 8_000,
      );
    };
    uniLoop();

    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(uniTimer);
      started.current = false;
    };
  }, []);
}
