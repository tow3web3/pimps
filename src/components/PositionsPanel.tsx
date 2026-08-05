"use client";

import { useState } from "react";
import { useGame } from "@/lib/store";
import { useMarket } from "@/lib/market";
import { RULES } from "@/lib/rules";
import { fmtQty, fmtSignedSol, fmtSol, fmtTime } from "@/lib/format";
import { TokenIcon } from "./TokenList";

export default function PositionsPanel() {
  const game = useGame();
  const { tokens, select } = useMarket();
  const [tab, setTab] = useState<"positions" | "history">("positions");

  return (
    <div className="glass flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center border-b border-[var(--border)]">
        {(["positions", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`mono text-[11px] tracking-[0.18em] uppercase px-4 py-2.5 transition-colors ${
              tab === t
                ? "text-[var(--cyan)] border-b border-[var(--cyan)]"
                : "text-[var(--ink-3)] hover:text-[var(--ink-2)]"
            }`}
          >
            {t}
            {t === "positions" && game.positions.length > 0 && (
              <span className="ml-1.5 text-[var(--ink-2)]">{game.positions.length}</span>
            )}
          </button>
        ))}
        <span className="ml-auto panel-title pr-4">
          cash {fmtSol(game.cashSol, 2)} SOL
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "positions" && (
          <>
            {game.positions.length === 0 && (
              <p className="mono text-xs text-[var(--ink-3)] p-5 text-center">
                no open positions — pick a token and size a buy
              </p>
            )}
            {game.positions.length > 0 && (
              <table className="w-full mono text-[11px]">
                <thead>
                  <tr className="text-[var(--ink-3)] text-left">
                    <th className="font-normal px-4 py-2">token</th>
                    <th className="font-normal px-2 py-2 text-right">qty</th>
                    <th className="font-normal px-2 py-2 text-right">avg · sol</th>
                    <th className="font-normal px-2 py-2 text-right">mark · sol</th>
                    <th className="font-normal px-2 py-2 text-right">value</th>
                    <th className="font-normal px-2 py-2 text-right">upnl</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {game.positions.map((p) => {
                    const mark = tokens[p.mint]?.priceSol ?? p.avgPriceSol;
                    const value = p.qty * mark;
                    const pnl = value * (1 - RULES.feeRate) - p.investedSol;
                    const pnlPct = p.investedSol > 0 ? (pnl / p.investedSol) * 100 : 0;
                    return (
                      <tr
                        key={p.mint}
                        className="border-t border-[var(--border)] hover:bg-[rgba(140,160,255,0.04)] cursor-pointer"
                        onClick={() => select(p.mint)}
                      >
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2">
                            <TokenIcon url={p.imageUrl} symbol={p.symbol} size={20} />
                            <span className="font-medium">{p.symbol}</span>
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right text-[var(--ink-2)]">
                          {fmtQty(p.qty)}
                        </td>
                        <td className="px-2 py-2.5 text-right text-[var(--ink-2)]">
                          {p.avgPriceSol.toExponential(2)}
                        </td>
                        <td className="px-2 py-2.5 text-right text-[var(--ink-2)]">
                          {mark.toExponential(2)}
                        </td>
                        <td className="px-2 py-2.5 text-right">{fmtSol(value, 3)}</td>
                        <td
                          className={`px-2 py-2.5 text-right ${pnl >= 0 ? "text-up" : "text-down"}`}
                        >
                          {fmtSignedSol(pnl)} ({pnlPct >= 0 ? "+" : ""}
                          {pnlPct.toFixed(1)}%)
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void Promise.resolve(useGame.getState().sell(p.mint, 1, mark));
                            }}
                            className="chip hover:!border-[rgba(251,113,133,0.55)] hover:!text-[var(--down)] transition-colors"
                          >
                            close
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === "history" && (
          <>
            {game.trades.length === 0 && (
              <p className="mono text-xs text-[var(--ink-3)] p-5 text-center">no fills yet</p>
            )}
            {game.trades.length > 0 && (
              <table className="w-full mono text-[11px]">
                <thead>
                  <tr className="text-[var(--ink-3)] text-left">
                    <th className="font-normal px-4 py-2">time</th>
                    <th className="font-normal px-2 py-2">side</th>
                    <th className="font-normal px-2 py-2">token</th>
                    <th className="font-normal px-2 py-2 text-right">qty</th>
                    <th className="font-normal px-2 py-2 text-right">sol</th>
                    <th className="font-normal px-2 py-2 text-right">fee</th>
                    <th className="font-normal px-4 py-2 text-right">realized</th>
                  </tr>
                </thead>
                <tbody>
                  {game.trades.map((t) => (
                    <tr key={t.id} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2 text-[var(--ink-3)]">{fmtTime(t.ts)}</td>
                      <td className={`px-2 py-2 uppercase ${t.side === "buy" ? "text-up" : "text-down"}`}>
                        {t.side}
                      </td>
                      <td className="px-2 py-2">{t.symbol}</td>
                      <td className="px-2 py-2 text-right text-[var(--ink-2)]">{fmtQty(t.qty)}</td>
                      <td className="px-2 py-2 text-right">{fmtSol(t.solAmount, 3)}</td>
                      <td className="px-2 py-2 text-right text-[var(--ink-3)]">
                        {fmtSol(t.feeSol, 4)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {t.pnlSol !== undefined ? (
                          <span className={t.pnlSol >= 0 ? "text-up" : "text-down"}>
                            {fmtSignedSol(t.pnlSol)}
                          </span>
                        ) : (
                          <span className="text-[var(--ink-3)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
