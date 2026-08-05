"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useMarket } from "@/lib/market";
import { useGame } from "@/lib/store";
import { fmtCompact, fmtPct, fmtUsd } from "@/lib/format";
import { RULES } from "@/lib/rules";

function TokenIcon({ url, symbol, size = 26 }: { url?: string; symbol: string; size?: number }) {
  if (url) {
    return (
      <Image
        src={url}
        alt={symbol}
        width={size}
        height={size}
        unoptimized
        className="rounded-full border border-[var(--border)] shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full border border-[var(--border)] bg-[rgba(140,160,255,0.08)] flex items-center justify-center shrink-0 mono text-[10px] text-[var(--ink-2)]"
      style={{ width: size, height: size }}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}

export { TokenIcon };

type SortKey = "vol" | "mcap" | "chg24h" | "new";

const SORTS: Record<SortKey, (a: import("@/lib/types").TokenInfo, b: import("@/lib/types").TokenInfo) => number> = {
  vol: (a, b) => b.vol24Usd - a.vol24Usd,
  mcap: (a, b) => b.mcapUsd - a.mcapUsd,
  chg24h: (a, b) => b.chg24h - a.chg24h,
  new: (a, b) => (a.ageHours ?? 1e9) - (b.ageHours ?? 1e9),
};

function fmtAge(h?: number): string {
  if (!h) return "";
  if (h < 24) return `${Math.max(1, Math.floor(h))}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function TokenList() {
  const { tokens, universe, selected, select, universeLoaded } = useMarket();
  const positions = useGame((s) => s.positions);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("vol");
  const [minMcap, setMinMcap] = useState(0);
  const [minVol, setMinVol] = useState(0);

  const heldMints = useMemo(() => new Set(positions.map((p) => p.mint)), [positions]);

  const rows = useMemo(() => {
    let list = universe.map((m) => tokens[m]).filter(Boolean);
    if (minMcap > 0) list = list.filter((t) => t.mcapUsd >= minMcap);
    if (minVol > 0) list = list.filter((t) => t.vol24Usd >= minVol);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.symbol.toLowerCase().includes(needle) ||
          t.name.toLowerCase().includes(needle) ||
          t.mint.toLowerCase().startsWith(needle),
      );
    }
    // an open position is ALWAYS listed, whatever the filters or its market cap:
    // you must be able to find and exit what you hold
    const shown = new Set(list.map((t) => t.mint));
    for (const p of positions) {
      if (shown.has(p.mint)) continue;
      const t = tokens[p.mint];
      if (t) list = [t, ...list];
    }
    return [...list].sort(SORTS[sort]);
  }, [tokens, universe, positions, q, sort, minMcap, minVol]);

  return (
    <div className="glass flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="panel-title">
            universe <span className="text-[var(--cyan)]">{rows.length}</span>
          </span>
          <span className="chip">pump.fun ≥ {fmtCompact(RULES.minMcapUsd)}</span>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search token…"
          className="field !py-2 !text-xs"
        />
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="field !py-1.5 !px-2 !text-[10px] !rounded-lg cursor-pointer"
            title="sort"
          >
            <option value="vol">↓ volume</option>
            <option value="mcap">↓ mcap</option>
            <option value="chg24h">↓ 24h %</option>
            <option value="new">↓ newest</option>
          </select>
          <select
            value={minMcap}
            onChange={(e) => setMinMcap(Number(e.target.value))}
            className="field !py-1.5 !px-2 !text-[10px] !rounded-lg cursor-pointer"
            title="min market cap"
          >
            <option value={0}>mc ≥ 100K</option>
            <option value={250_000}>mc ≥ 250K</option>
            <option value={1_000_000}>mc ≥ 1M</option>
            <option value={10_000_000}>mc ≥ 10M</option>
          </select>
          <select
            value={minVol}
            onChange={(e) => setMinVol(Number(e.target.value))}
            className="field !py-1.5 !px-2 !text-[10px] !rounded-lg cursor-pointer"
            title="min 24h volume"
          >
            <option value={0}>vol · any</option>
            <option value={100_000}>vol ≥ 100K</option>
            <option value={1_000_000}>vol ≥ 1M</option>
            <option value={10_000_000}>vol ≥ 10M</option>
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!universeLoaded && (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-[rgba(140,160,255,0.05)] animate-pulse" />
            ))}
          </div>
        )}
        {universeLoaded && rows.length === 0 && (
          <p className="mono text-xs text-[var(--ink-3)] p-4">no token matches</p>
        )}
        {rows.map((t) => {
          const up = t.chg24h >= 0;
          return (
            <button
              key={t.mint}
              onClick={() => select(t.mint)}
              className={`token-row w-full text-left px-3 py-2.5 flex items-center gap-2.5 ${
                selected === t.mint ? "selected" : ""
              }`}
            >
              <TokenIcon url={t.imageUrl} symbol={t.symbol} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="mono text-[13px] font-medium truncate">{t.symbol}</span>
                  {heldMints.has(t.mint) && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] shrink-0"
                      title="position open"
                    />
                  )}
                </div>
                <div className="mono text-[10px] text-[var(--ink-3)]">
                  {t.mcapUsd < RULES.minMcapUsd ? (
                    <span className="text-[var(--amber)]">
                      mc {fmtCompact(t.mcapUsd)} · sell only
                    </span>
                  ) : (
                    <>
                      mc {fmtCompact(t.mcapUsd)}
                      {t.ageHours ? ` · ${fmtAge(t.ageHours)}` : ""}
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="mono text-[12px]">{fmtUsd(t.priceUsd)}</div>
                <div className={`mono text-[10px] ${up ? "text-up" : "text-down"}`}>
                  {fmtPct(t.chg24h, 1)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
