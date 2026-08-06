"use client";

import { useEffect, useState } from "react";
import { useMarket } from "@/lib/market";
import { maxBuySol, useGame } from "@/lib/store";
import { RULES } from "@/lib/rules";
import { fmtQty, fmtSol, fmtSignedSol, fmtUsd } from "@/lib/format";

// The pump.fun-style trade surface: the buy box never leaves the screen while
// you watch the chart, sizes are one tap, and the sheet only expands when you
// need the details.

const QUICK_SOL = [0.25, 0.5, 1, 2];

export default function MobileTradeBar() {
  const { tokens, selected, solUsd } = useMarket();
  const game = useGame();
  const token = selected ? tokens[selected] : undefined;

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [fraction, setFraction] = useState(1);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setMsg(null);
    setAmount("");
  }, [selected]);

  if (!token) return null;

  const position = game.positions.find((p) => p.mint === token.mint);
  const maxSol = maxBuySol(game.cashSol, game.equity, game.positions, token.mint, token.priceSol);
  const amt = parseFloat(amount) || 0;
  const estQty = token.priceSol > 0 ? (amt * (1 - RULES.feeRate)) / token.priceSol : 0;
  const posValueSol = position ? position.qty * token.priceSol : 0;
  const posPnl = position ? posValueSol * (1 - RULES.feeRate) - position.investedSol : 0;
  const sellQty = position ? position.qty * fraction : 0;
  const belowFloor = token.mcapUsd < RULES.minMcapUsd;
  const canTrade = game.status === "active";

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const doBuy = async (sol: number) => {
    if (busy || sol <= 0) return;
    setBusy(true);
    try {
      const r = await Promise.resolve(game.buy(token, sol));
      if (r.ok) {
        flash(true, `bought ${fmtQty((sol * (1 - RULES.feeRate)) / token.priceSol)} ${token.symbol}`);
        setAmount("");
        setOpen(false);
      } else flash(false, r.error ?? "rejected");
    } finally {
      setBusy(false);
    }
  };

  const doSell = async (f: number) => {
    if (busy || !position) return;
    setBusy(true);
    try {
      const r = await Promise.resolve(game.sell(token.mint, f, token.priceSol));
      if (r.ok) {
        flash(true, `sold ${(f * 100).toFixed(0)}% ${token.symbol}`);
        setOpen(false);
      } else flash(false, r.error ?? "rejected");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* dim the terminal behind the expanded sheet */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-[rgba(3,4,9,0.6)]"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="lg:hidden fixed inset-x-0 bottom-[56px] z-40">
        {msg && (
          <p
            className={`mono text-[11px] mx-2 mb-1.5 rounded-lg px-3 py-2 border backdrop-blur ${
              msg.ok
                ? "text-up border-[rgba(0,214,143,0.4)] bg-[rgba(6,20,16,0.92)]"
                : "text-down border-[rgba(255,82,82,0.4)] bg-[rgba(24,8,12,0.92)]"
            }`}
          >
            {msg.ok ? "✓ " : "✕ "}
            {msg.text}
          </p>
        )}

        <div className="glass !rounded-b-none !border-b-0 mx-0 overflow-hidden">
          {/* position strip — always visible when you hold the token */}
          {position && (
            <button
              onClick={() => {
                setSide("sell");
                setOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[rgba(255,176,0,0.05)]"
            >
              <span className="panel-title">holding</span>
              <span className="mono text-[11px]">
                {fmtQty(position.qty)} {token.symbol}
              </span>
              <span className="mono text-[11px] ml-auto">{fmtSol(posValueSol, 3)} SOL</span>
              <span className={`mono text-[11px] ${posPnl >= 0 ? "text-up" : "text-down"}`}>
                {fmtSignedSol(posPnl, 2)}
              </span>
            </button>
          )}

          {/* the sheet */}
          {open && (
            <div className="p-3 border-b border-[var(--border)] space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(["buy", "sell"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className={`mono text-[12px] tracking-[0.18em] uppercase py-2.5 rounded-lg border transition-colors ${
                      side === s
                        ? s === "buy"
                          ? "text-up border-[var(--up)] bg-[rgba(0,214,143,0.1)]"
                          : "text-down border-[var(--down)] bg-[rgba(255,82,82,0.1)]"
                        : "text-[var(--ink-3)] border-[var(--border)]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {side === "buy" ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="panel-title">amount · sol</span>
                    <span className="mono text-[10px] text-[var(--ink-3)]">
                      cash {fmtSol(game.cashSol, 2)} · max {fmtSol(maxSol, 2)}
                    </span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="field !text-xl !py-3"
                  />
                  <div className="mono text-[11px] text-[var(--ink-2)] flex justify-between">
                    <span>
                      ≈ {fmtQty(Math.max(0, estQty))} {token.symbol}
                    </span>
                    <span>{solUsd ? fmtUsd(amt * solUsd) : ""}</span>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {[0.25, 0.5, 0.75, 1].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFraction(f)}
                      className={`mono text-[12px] py-2.5 rounded-lg border ${
                        fraction === f
                          ? "text-down border-[var(--down)] bg-[rgba(255,82,82,0.1)]"
                          : "text-[var(--ink-2)] border-[var(--border)]"
                      }`}
                    >
                      {f * 100}%
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                <span className="chip">max {RULES.maxExposure * 100}%</span>
                <span className="chip">fee {RULES.feeRate * 100}%</span>
                <span className="chip">
                  {game.trades.length}/{RULES.minTrades} fills
                </span>
              </div>
            </div>
          )}

          {/* the always-visible action row */}
          {side === "buy" || !position ? (
            <div className="flex items-stretch gap-1.5 p-2">
              {!open ? (
                <>
                  {QUICK_SOL.map((s) => (
                    <button
                      key={s}
                      onClick={() => doBuy(Math.min(s, maxSol))}
                      disabled={busy || !canTrade || belowFloor || maxSol < s * 0.999}
                      className="btn btn-buy flex-1 !px-0 !py-3 !text-[12px]"
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setSide("buy");
                      setOpen(true);
                    }}
                    className="btn btn-cyan !px-3.5 !py-3 shrink-0 flex flex-col items-center gap-0"
                    aria-label="more options"
                    title="more — custom amount, sell, details"
                  >
                    <span className="text-[13px] leading-none animate-bounce">▲</span>
                    <span className="text-[8px] tracking-[0.1em] mt-0.5">more</span>
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setOpen(false)} className="btn !px-4 !py-3.5 shrink-0">
                    ✕
                  </button>
                  <button
                    onClick={() => doBuy(amt)}
                    disabled={busy || amt <= 0 || amt > maxSol + 1e-9 || !canTrade || belowFloor}
                    className="btn btn-buy flex-1 !py-3.5"
                  >
                    {busy ? "filling…" : `buy ${token.symbol}`}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-stretch gap-1.5 p-2">
              {!open ? (
                <>
                  {[0.25, 0.5, 1].map((f) => (
                    <button
                      key={f}
                      onClick={() => doSell(f)}
                      disabled={busy || !canTrade}
                      className="btn btn-sell flex-1 !px-0 !py-3 !text-[12px]"
                    >
                      {f === 1 ? "ALL" : `${f * 100}%`}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setSide("buy");
                      setOpen(true);
                    }}
                    className="btn btn-buy !px-4 !py-3 shrink-0 !text-[12px]"
                  >
                    buy
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setOpen(false)} className="btn !px-4 !py-3.5 shrink-0">
                    ✕
                  </button>
                  <button
                    onClick={() => doSell(fraction)}
                    disabled={busy || !canTrade}
                    className="btn btn-sell flex-1 !py-3.5"
                  >
                    {busy ? "filling…" : `sell ${(fraction * 100).toFixed(0)}%`}
                  </button>
                </>
              )}
            </div>
          )}

          {belowFloor && (
            <p className="mono text-[10px] text-[var(--amber)] px-3 pb-2">
              ⚠ under the ${RULES.minMcapUsd / 1000}K floor — sell only
            </p>
          )}
        </div>
      </div>
    </>
  );
}
