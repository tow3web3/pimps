"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarket } from "@/lib/market";
import { maxBuySol, useGame } from "@/lib/store";
import { RULES } from "@/lib/rules";
import { fmtCompact, fmtMicro, fmtQty, fmtSignedSol, fmtSol, fmtUsd } from "@/lib/format";

export default function TradePanel() {
  const { tokens, selected, solUsd } = useMarket();
  const game = useGame();
  const token = selected ? tokens[selected] : undefined;

  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [fraction, setFraction] = useState(1);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setMsg(null);
    setAmount("");
  }, [selected]);

  const position = token ? game.positions.find((p) => p.mint === token.mint) : undefined;

  const maxSol = token
    ? maxBuySol(game.cashSol, game.equity, game.positions, token.mint, token.priceSol)
    : 0;

  const amt = parseFloat(amount) || 0;
  const feeSol = amt * RULES.feeRate;
  const estQty = token && token.priceSol > 0 ? (amt - feeSol) / token.priceSol : 0;

  const exposureAfter = useMemo(() => {
    if (!token || game.equity <= 0) return 0;
    const cur = position ? position.qty * token.priceSol : 0;
    return (cur + amt) / game.equity;
  }, [token, position, amt, game.equity]);

  const posValueSol = position && token ? position.qty * token.priceSol : 0;
  const posPnl = position && token ? posValueSol * (1 - RULES.feeRate) - position.investedSol : 0;
  const entryPct =
    position && token && position.avgPriceSol > 0
      ? ((token.priceSol - position.avgPriceSol) / position.avgPriceSol) * 100
      : 0;
  const sellQty = position ? position.qty * fraction : 0;
  const sellGross = token ? sellQty * token.priceSol : 0;
  const sellProceeds = sellGross * (1 - RULES.feeRate);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const doBuy = async () => {
    if (!token) return;
    const r = await Promise.resolve(game.buy(token, amt));
    if (r.ok) {
      flash("ok", `filled · bought ${fmtQty(estQty)} ${token.symbol}`);
      setAmount("");
    } else flash("err", r.error ?? "rejected");
  };

  const doSell = async () => {
    if (!token || !position) return;
    const r = await Promise.resolve(game.sell(token.mint, fraction, token.priceSol));
    if (r.ok) flash("ok", `filled · sold ${fmtQty(sellQty)} ${token.symbol}`);
    else flash("err", r.error ?? "rejected");
  };

  const notBuyable = !!token && token.mcapUsd < RULES.minMcapUsd;

  return (
    <div className="glass flex flex-col overflow-hidden">
      <div className="grid grid-cols-2">
        {(["buy", "sell"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`mono text-xs tracking-[0.2em] uppercase py-3 transition-colors border-b ${
              tab === t
                ? t === "buy"
                  ? "text-up border-[var(--up)] bg-[rgba(0,214,143,0.06)]"
                  : "text-down border-[var(--down)] bg-[rgba(255,82,82,0.06)]"
                : "text-[var(--ink-3)] border-[var(--border)] hover:text-[var(--ink-2)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {!token && (
          <p className="mono text-xs text-[var(--ink-3)] py-6 text-center">select a token</p>
        )}

        {token && tab === "buy" && (
          <>
            <div>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="panel-title">amount · sol</span>
                <span className="mono text-[10px] text-[var(--ink-3)]">
                  cash {fmtSol(game.cashSol, 2)} SOL
                </span>
              </div>
              <input
                type="number"
                min={0}
                step={0.1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="field text-lg"
              />
              <div className="flex gap-1.5 mt-2">
                {[0.25, 0.5, 0.75].map((f) => (
                  <button
                    key={f}
                    onClick={() => setAmount((maxSol * f).toFixed(2))}
                    className="chip hover:border-[var(--border-strong)] hover:text-[var(--ink)] transition-colors flex-1"
                  >
                    {f * 100}%
                  </button>
                ))}
                <button
                  onClick={() => setAmount(maxSol.toFixed(2))}
                  className="chip hover:border-[rgba(255,90,0,0.5)] hover:text-[var(--cyan)] transition-colors flex-1"
                >
                  max
                </button>
              </div>
            </div>

            <div className="space-y-1.5 mono text-[11px] text-[var(--ink-2)]">
              <div className="flex justify-between">
                <span>est. received</span>
                <span className="text-[var(--ink)]">
                  {fmtQty(Math.max(0, estQty))} {token.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span>fee · {(RULES.feeRate * 100).toFixed(0)}%</span>
                <span>{fmtSol(feeSol, 3)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span>≈ usd</span>
                <span>{solUsd ? fmtUsd(amt * solUsd) : "—"}</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="panel-title">exposure after</span>
                <span
                  className={`mono text-[10px] ${
                    exposureAfter > RULES.maxExposure ? "text-down" : "text-[var(--ink-2)]"
                  }`}
                >
                  {(exposureAfter * 100).toFixed(1)}% / {RULES.maxExposure * 100}% cap
                </span>
              </div>
              <div className="meter">
                <div
                  className="meter-fill"
                  style={{
                    width: `${Math.min(100, (exposureAfter / RULES.maxExposure) * 100)}%`,
                    background:
                      exposureAfter > RULES.maxExposure
                        ? "var(--down)"
                        : "linear-gradient(90deg, var(--cyan), var(--violet))",
                  }}
                />
              </div>
            </div>

            {notBuyable && (
              <p className="mono text-[10px] text-amber-300/90 border border-amber-300/25 rounded-lg px-2.5 py-1.5">
                ⚠ token below the ${RULES.minMcapUsd / 1000}K mcap floor — sell only
              </p>
            )}

            <button
              onClick={doBuy}
              disabled={amt <= 0 || amt > maxSol + 1e-9 || notBuyable || game.status !== "active"}
              className="btn btn-buy w-full py-3"
            >
              buy {token.symbol}
            </button>
          </>
        )}

        {token && tab === "sell" && (
          <>
            {!position && (
              <p className="mono text-xs text-[var(--ink-3)] py-6 text-center">
                no open position on {token.symbol}
              </p>
            )}
            {position && (
              <>
                <div className="space-y-1.5 mono text-[11px] text-[var(--ink-2)]">
                  <div className="flex justify-between">
                    <span>holding</span>
                    <span className="text-[var(--ink)]">
                      {fmtQty(position.qty)} {token.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>avg entry</span>
                    <span className="text-[var(--ink)]">
                      {position.avgPriceUsd > 0
                        ? `$${fmtMicro(position.avgPriceUsd)}`
                        : solUsd > 0
                          ? `$${fmtMicro(position.avgPriceSol * solUsd)}`
                          : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>now</span>
                    <span
                      className={
                        token.priceSol > position.avgPriceSol
                          ? "text-up"
                          : token.priceSol < position.avgPriceSol
                            ? "text-down"
                            : "text-[var(--ink)]"
                      }
                    >
                      {fmtUsd(token.priceUsd)}
                      <span className="text-[var(--ink-3)] ml-1.5">
                        ({entryPct >= 0 ? "+" : ""}
                        {entryPct.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>value</span>
                    <span className="text-[var(--ink)]">{fmtSol(posValueSol, 3)} SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>unrealized pnl</span>
                    <span className={posPnl >= 0 ? "text-up" : "text-down"}>
                      {fmtSignedSol(posPnl)} SOL
                    </span>
                  </div>
                </div>

                <div>
                  <span className="panel-title block mb-1.5">sell size</span>
                  <div className="flex gap-1.5">
                    {[0.25, 0.5, 0.75, 1].map((f) => (
                      <button
                        key={f}
                        onClick={() => setFraction(f)}
                        className={`chip flex-1 transition-colors ${
                          fraction === f
                            ? "!border-[rgba(255,82,82,0.55)] !text-[var(--down)]"
                            : "hover:border-[var(--border-strong)]"
                        }`}
                      >
                        {f * 100}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 mono text-[11px] text-[var(--ink-2)]">
                  <div className="flex justify-between">
                    <span>est. proceeds</span>
                    <span className="text-[var(--ink)]">{fmtSol(sellProceeds, 3)} SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>fee · {(RULES.feeRate * 100).toFixed(0)}%</span>
                    <span>{fmtSol(sellGross * RULES.feeRate, 3)} SOL</span>
                  </div>
                </div>

                <button
                  onClick={doSell}
                  disabled={game.status !== "active"}
                  className="btn btn-sell w-full py-3"
                >
                  sell {(fraction * 100).toFixed(0)}% {token.symbol}
                </button>
              </>
            )}
          </>
        )}

        {msg && (
          <p
            className={`mono text-[11px] rounded-lg px-2.5 py-1.5 border ${
              msg.kind === "ok"
                ? "text-up border-[rgba(0,214,143,0.3)] bg-[rgba(0,214,143,0.06)]"
                : "text-down border-[rgba(255,82,82,0.3)] bg-[rgba(255,82,82,0.06)]"
            }`}
          >
            {msg.kind === "ok" ? "✓ " : "✕ "}
            {msg.text}
          </p>
        )}

        {token && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[var(--border)]">
            <span className="chip">max {RULES.maxExposure * 100}% / token</span>
            <span className="chip">fail &lt; {fmtSol(RULES.failFloor, 1)} SOL</span>
            <span className="chip">min {RULES.minTrades} trades</span>
            <span className="chip">mcap ≥ {fmtCompact(RULES.minMcapUsd)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
