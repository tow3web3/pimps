"use client";

import { useEffect, useRef, useState } from "react";
import { useMarket } from "@/lib/market";
import { fmtQty, fmtSol, fmtSignedSol } from "@/lib/format";

export interface FeedTrade {
  ts: number;
  side: "buy" | "sell";
  symbol: string;
  mint: string;
  qty: number;
  solAmount: number;
  pnlSol: number | null;
  trader: string;
  funded: boolean;
}

/** shared poller so the strip and the panel never double-fetch */
export function useFeed(intervalMs = 6_000) {
  const [trades, setTrades] = useState<FeedTrade[]>([]);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/feed", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (!stop) setTrades(j.trades ?? []);
      } catch {
        /* the tape is decoration — never break the terminal over it */
      }
    };
    load();
    const iv = setInterval(load, intervalMs);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [intervalMs]);
  return trades;
}

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

/** one line of tape */
function Line({ t, onPick }: { t: FeedTrade; onPick?: (mint: string) => void }) {
  return (
    <button
      onClick={() => onPick?.(t.mint)}
      className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-[rgba(242,239,230,0.05)] transition-colors"
    >
      <span
        className={`mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
          t.side === "buy"
            ? "text-up bg-[rgba(0,214,143,0.12)]"
            : "text-down bg-[rgba(255,82,82,0.12)]"
        }`}
      >
        {t.side === "buy" ? "BUY" : "SELL"}
      </span>
      <span className="mono text-[11px] font-medium truncate">{t.symbol}</span>
      <span className="mono text-[10px] text-[var(--ink-3)] truncate">
        {fmtQty(t.qty)}
      </span>
      <span className="mono text-[10px] text-[var(--ink-2)] ml-auto shrink-0">
        {fmtSol(t.solAmount, 2)} SOL
      </span>
      {t.pnlSol !== null && (
        <span
          className={`mono text-[10px] shrink-0 ${t.pnlSol >= 0 ? "text-up" : "text-down"}`}
        >
          {fmtSignedSol(t.pnlSol, 2)}
        </span>
      )}
      <span className="mono text-[10px] text-[var(--ink-3)] shrink-0 hidden sm:inline">
        {t.funded && <span className="text-[var(--violet)]">◆ </span>}
        {t.trader}
      </span>
      <span className="mono text-[10px] text-[var(--ink-3)] shrink-0 w-7 text-right">
        {ago(t.ts)}
      </span>
    </button>
  );
}

/** scrolling panel — the desk's tape */
export default function LiveFeed({ compact = false }: { compact?: boolean }) {
  const trades = useFeed();
  const select = useMarket((s) => s.select);
  const tokens = useMarket((s) => s.tokens);

  const pick = (mint: string) => {
    if (tokens[mint]) select(mint);
  };

  return (
    <div className="glass flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)]">
        <span className="live-dot" />
        <span className="panel-title">live tape · the whole desk</span>
        <span className="chip ml-auto">{trades.length}</span>
      </div>
      <div className={`overflow-y-auto ${compact ? "max-h-[220px]" : "flex-1 min-h-0"}`}>
        {trades.length === 0 ? (
          <p className="mono text-[11px] text-[var(--ink-3)] p-4 text-center">
            no trades yet — be the first on the tape
          </p>
        ) : (
          trades.map((t, i) => <Line key={`${t.ts}-${i}`} t={t} onPick={pick} />)
        )}
      </div>
    </div>
  );
}

/** toast that pops when a new trade lands — the "someone just aped" signal */
export function FeedToasts() {
  const trades = useFeed(6_000);
  const seen = useRef<number>(0);
  const [toast, setToast] = useState<FeedTrade | null>(null);

  useEffect(() => {
    if (trades.length === 0) return;
    const latest = trades[0];
    if (seen.current === 0) {
      seen.current = latest.ts; // don't flood on first load
      return;
    }
    if (latest.ts > seen.current) {
      seen.current = latest.ts;
      setToast(latest);
      const t = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(t);
    }
  }, [trades]);

  if (!toast) return null;
  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-50 overlay-card pointer-events-none">
      <div
        className={`glass px-4 py-3 flex items-center gap-2.5 ${
          toast.side === "buy"
            ? "!border-[rgba(0,214,143,0.45)]"
            : "!border-[rgba(255,82,82,0.45)]"
        }`}
      >
        <span className={`mono text-[11px] ${toast.side === "buy" ? "text-up" : "text-down"}`}>
          {toast.side === "buy" ? "▲ BUY" : "▼ SELL"}
        </span>
        <span className="mono text-[12px] font-medium">{toast.symbol}</span>
        <span className="mono text-[11px] text-[var(--ink-2)]">
          {fmtSol(toast.solAmount, 2)} SOL
        </span>
        <span className="mono text-[10px] text-[var(--ink-3)]">{toast.trader}</span>
      </div>
    </div>
  );
}
