"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRAND, entryFeeGfUsd, RULES } from "@/lib/rules";
import { useGame } from "@/lib/store";
import { fmtUsd } from "@/lib/format";
import { getProvider, payUsdc, realPaymentsAvailable } from "@/lib/payments";
import { connectWallet, serverEnter, useAuth } from "@/lib/authClient";

type Method = "usdc" | "gf" | "free";

const stepsFor = (m: Method): Array<{ text: string; ms: number }> =>
  m === "free"
    ? [
        { text: "registering free roll seat…", ms: 800 },
        { text: `reward capped at $${RULES.freeRewardUsd} funded — same rules, zero entry`, ms: 900 },
        { text: "✓ seat confirmed — welcome to the desk", ms: 700 },
      ]
    : [
        { text: "creating payment intent… nonce 0x8f3a91c4", ms: 700 },
        {
          text:
            m === "gf"
              ? `awaiting ${RULES.token.symbol} transfer… holder discount −${RULES.token.discount * 100}% applied`
              : "awaiting usdc transfer…",
          ms: 1100,
        },
        { text: "verifying treasury balance change on-chain…", ms: 1000 },
        { text: "✓ seat confirmed — welcome to the desk", ms: 700 },
      ];

export default function EnterPage() {
  const router = useRouter();
  const game = useGame();
  const [method, setMethod] = useState<Method>("gf");
  const [processing, setProcessing] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [live, setLive] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setMounted(true);
    setLive(realPaymentsAvailable());
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const runSimulated = (m: Method) => {
    const steps =
      m === "free"
        ? stepsFor(m)
        : [
            { text: "⚠ preview mode — no real transfer (treasury wallet not configured yet)", ms: 900 },
            ...stepsFor(m),
          ];
    let at = 300;
    steps.forEach((s, i) => {
      timers.current.push(setTimeout(() => setLines((l) => [...l, s.text]), at));
      at += s.ms;
      if (i === steps.length - 1) {
        timers.current.push(
          setTimeout(() => {
            useGame.getState().payEntry(m);
            router.push("/terminal");
          }, at + 400),
        );
      }
    });
  };

  // authenticated path: the SERVER verifies the payment and creates the run
  const runServer = async () => {
    try {
      let wallet: string | null = useAuth.getState().wallet;
      if (!wallet) {
        setLines((l) => [...l, "connecting wallet…"]);
        wallet = await connectWallet();
        const w = wallet;
        setLines((l) => [...l, `wallet ${w.slice(0, 4)}…${w.slice(-4)} signed in`]);
      }
      let txSig: string | undefined;
      if (method !== "free" && live) {
        txSig = await payUsdc(method === "gf" ? gfPrice : usdcPrice, (line) =>
          setLines((l) => [...l, line]),
        );
      } else if (method !== "free") {
        setLines((l) => [...l, "⚠ preview — treasury not configured, seat granted without transfer"]);
      }
      setLines((l) => [...l, "registering seat with the server…"]);
      const r = await serverEnter(method, txSig);
      if (!r.ok) throw new Error(r.error);
      setLines((l) => [...l, "✓ seat confirmed — the server is watching your run"]);
      timers.current.push(setTimeout(() => router.push("/terminal"), 900));
    } catch (e) {
      setLines((l) => [...l, `✕ ${e instanceof Error ? e.message : "failed"}`]);
      setProcessing(false);
    }
  };

  const pay = () => {
    if (processing) return;
    setProcessing(true);
    setLines([]);
    // with a wallet available we always go through the server (real accounts);
    // pure guests without any wallet extension keep the local simulation
    const hasWallet = useAuth.getState().wallet !== null || getProvider() !== null;
    if (hasWallet) void runServer();
    else runSimulated(method);
  };

  // in live mode the GF lane waits for the token to exist on-chain
  const gfUnavailable = live && method === "gf" && !RULES.token.mint;

  const usdcPrice = RULES.entryFeeUsd;
  const gfPrice = entryFeeGfUsd();
  const reentry = mounted && game.status === "failed";

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between px-6 md:px-10 h-16">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-2 h-2 rotate-45 bg-[var(--cyan)] shadow-[0_0_12px_var(--cyan-glow)]" />
          <span className="mono font-bold tracking-[0.3em] text-sm">{BRAND}</span>
        </Link>
        <Link href="/terminal" className="chip hover:text-[var(--ink)] transition-colors">
          skip — already seated ▸
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-2xl">
          <p className="panel-title text-center">
            {reentry ? `re-entry · attempt #${game.attempt + 1}` : "entry"}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-center mt-2">
            {reentry ? "Back for another run." : "Take your seat."}
          </h1>
          <p className="text-center text-[var(--ink-2)] text-sm mt-3 max-w-md mx-auto">
            One fee, the full 3-challenge gauntlet. Pay with {RULES.token.symbol} and the firm
            takes {RULES.token.discount * 100}% off.
          </p>
          {mounted && (
            <p className="text-center mt-3">
              <span
                className={`chip ${
                  live
                    ? "!text-[var(--up)] !border-[rgba(52,211,153,0.45)]"
                    : "!text-[var(--amber)] !border-[rgba(251,191,36,0.35)]"
                }`}
              >
                {live ? "● payments live · on-chain usdc" : "◌ payments simulated · preview"}
              </span>
            </p>
          )}

          {!processing ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
                {/* FREE ROLL */}
                <button
                  onClick={() => setMethod("free")}
                  className={`glass glass-hover p-6 text-left relative overflow-hidden transition-all ${
                    method === "free"
                      ? "!border-[rgba(52,211,153,0.55)] shadow-[0_0_40px_rgba(52,211,153,0.12)]"
                      : "opacity-70"
                  }`}
                >
                  <span className="absolute top-4 right-4 chip !text-[var(--up)] !border-[rgba(52,211,153,0.5)]">
                    free roll
                  </span>
                  <div className="mono text-[10px] tracking-[0.25em] text-[var(--up)] pr-16">
                    $0 · FREE
                  </div>
                  <div className="mono text-4xl font-bold mt-3 text-up">$0</div>
                  <p className="mono text-[11px] text-[var(--ink-2)] mt-3 leading-relaxed">
                    same three challenges, same rules · pass and get a $
                    {RULES.freeRewardUsd} funded account instead of $
                    {RULES.entryFeeUsd * RULES.fundedMultiple}
                  </p>
                </button>
                {/* DGN — the discounted lane */}
                <button
                  onClick={() => setMethod("gf")}
                  className={`glass glass-hover p-6 text-left relative overflow-hidden transition-all ${
                    method === "gf"
                      ? "!border-[rgba(167,139,250,0.6)] shadow-[0_0_40px_rgba(167,139,250,0.15)]"
                      : "opacity-70"
                  }`}
                >
                  <span className="absolute top-4 right-4 chip !text-[var(--violet)] !border-[rgba(167,139,250,0.5)]">
                    −{RULES.token.discount * 100}%
                  </span>
                  <div className="mono text-[10px] tracking-[0.25em] text-[var(--violet)]">
                    ${RULES.token.symbol} · HOLDER LANE
                  </div>
                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="mono text-4xl font-bold gradient-text">
                      {fmtUsd(gfPrice)}
                    </span>
                    <span className="mono text-sm text-[var(--ink-3)] line-through">
                      {fmtUsd(usdcPrice)}
                    </span>
                  </div>
                  <p className="mono text-[11px] text-[var(--ink-2)] mt-3 leading-relaxed">
                    paid in {RULES.token.name} at market rate · burns back into the ecosystem
                  </p>
                </button>

                {/* USDC */}
                <button
                  onClick={() => setMethod("usdc")}
                  className={`glass glass-hover p-6 text-left transition-all ${
                    method === "usdc"
                      ? "!border-[rgba(34,211,238,0.5)] shadow-[0_0_40px_rgba(34,211,238,0.12)]"
                      : "opacity-70"
                  }`}
                >
                  <div className="mono text-[10px] tracking-[0.25em] text-[var(--cyan)]">
                    USDC · CLASSIC
                  </div>
                  <div className="mono text-4xl font-bold mt-3">{fmtUsd(usdcPrice)}</div>
                  <p className="mono text-[11px] text-[var(--ink-2)] mt-3 leading-relaxed">
                    plain usdc on solana · no token required
                  </p>
                </button>
              </div>

              <ul className="mono text-[11px] text-[var(--ink-2)] mt-6 space-y-1.5 max-w-md mx-auto">
                <li>▸ {RULES.startBalance} SOL demo stack per phase · live pump.fun prices</li>
                <li>
                  ▸ pass all three → $
                  {method === "free" ? RULES.freeRewardUsd : RULES.entryFeeUsd * RULES.fundedMultiple}{" "}
                  funded account · {RULES.profitSplit * 100}/{100 - RULES.profitSplit * 100} split
                </li>
                <li>▸ a losing run costs this fee, nothing more</li>
              </ul>

              <button
                onClick={pay}
                disabled={gfUnavailable}
                className="btn btn-primary w-full max-w-md mx-auto block !py-4 mt-8"
              >
                {method === "free"
                  ? "start the free roll ▸"
                  : gfUnavailable
                    ? `$${RULES.token.symbol} lane opens at token launch`
                    : `pay ${fmtUsd(method === "gf" ? gfPrice : usdcPrice)}${
                        method === "gf" ? ` in ${RULES.token.symbol}` : " usdc"
                      } ▸`}
              </button>
              <p className="mono text-[10px] text-[var(--ink-3)] mt-3 text-center">
                {live && method !== "free"
                  ? "live payment · phantom will ask you to sign a real usdc transfer on solana"
                  : "simulated in this preview build — no wallet is contacted, nothing is signed"}
              </p>
            </>
          ) : (
            <div className="glass max-w-md mx-auto mt-8 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="live-dot" />
                <span className="panel-title">processing payment · simulated</span>
              </div>
              <div className="mono text-[12px] space-y-2.5 min-h-[120px]">
                {lines.map((l, i) => (
                  <p
                    key={i}
                    className={`rise ${l.startsWith("✓") ? "text-up" : "text-[var(--ink-2)]"}`}
                  >
                    <span className="text-[var(--ink-3)] mr-2">{">"}</span>
                    {l}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
