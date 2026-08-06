import Link from "next/link";
import { BRAND, entryFeeGfUsd, fundedAccountUsd, RULES } from "@/lib/rules";
import HeroCanvas from "@/components/HeroCanvas";

export default function Landing() {
  const funded = fundedAccountUsd();
  const maxDrawdownPct = ((1 - RULES.failFloor / RULES.startBalance) * 100).toFixed(0);

  return (
    <div className="min-h-dvh">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative h-dvh min-h-[640px] flex flex-col overflow-hidden">
        <HeroCanvas />
        <div
          className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[var(--bg)]"
          aria-hidden
        />

        <header className="relative z-20 flex items-center justify-between px-6 md:px-10 h-16">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rotate-45 bg-[var(--cyan)] shadow-[0_0_12px_var(--cyan-glow)]" />
            <span className="mono font-bold tracking-[0.3em] text-sm">{BRAND}</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/whitepaper" className="chip hover:text-[var(--ink)] transition-colors hidden sm:block">
              whitepaper
            </Link>
            <Link href="/leaderboard" className="chip hover:text-[var(--ink)] transition-colors hidden md:block">
              board
            </Link>
            <Link href="/enter" className="btn btn-cyan !py-2 !px-4">
              launch terminal
            </Link>
          </nav>
        </header>

        <div
          className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 -mt-8"
          style={{ textShadow: "0 1px 24px rgba(3,4,9,0.85), 0 0 60px rgba(3,4,9,0.5)" }}
        >
          <span className="chip rise rise-1 !text-[var(--up)] !border-[rgba(52,211,153,0.45)] !text-[11px] !px-4 !py-1.5 hidden sm:inline-block">
            ● free to play — just connect a wallet, no payment
          </span>
          <h1 className="rise rise-2 font-bold leading-[0.95] mt-6 text-[clamp(44px,9vw,110px)] tracking-tight">
            TRADE MEMECOINS.
            <br />
            <span className="glitch gradient-text" data-text="GET FUNDED.">
              GET FUNDED.
            </span>
          </h1>
          <p className="rise rise-3 max-w-xl text-[var(--ink-2)] mt-6 text-sm md:text-base leading-relaxed">
            Run a {RULES.startBalance} SOL demo stack on live pump.fun markets. Clear three
            challenges — {RULES.phases.map((p) => p.gainLabel).join(", ")} — without breaking the
            floor, and the firm sends ${funded} straight to your Phantom.
          </p>
          <div className="rise rise-4 flex flex-col sm:flex-row items-center gap-3 mt-8">
            <Link href="/enter" className="btn btn-primary !text-sm !px-10 !py-4">
              launch terminal ▸
            </Link>
            <a href="#gauntlet" className="btn !px-8 !py-4">
              how it works
            </a>
          </div>
          <p className="rise rise-4 mono text-[11px] text-[var(--ink-3)] mt-3">
            play free, or get funded for real — choose on the next screen
          </p>

          <div className="rise rise-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mt-12 mono text-[11px] text-[var(--ink-3)]">
            <span>
              <b className="text-[var(--ink)] text-base">{RULES.startBalance} SOL</b> start
            </span>
            <span>
              <b className="text-[var(--ink)] text-base">3</b> challenges
            </span>
            <span>
              <b className="gradient-text text-base font-bold">{RULES.fundedMultiple}x</b> funding
            </span>
            <span>
              <b className="text-[var(--up)] text-base">$0</b> at risk while trading
            </span>
          </div>
        </div>

        <div className="relative z-10 pb-6 flex justify-center">
          <span className="mono text-[10px] tracking-[0.3em] text-[var(--ink-3)] animate-bounce">
            ▼
          </span>
        </div>
      </section>

      {/* ── THE GAUNTLET ─────────────────────────────────────── */}
      <section id="gauntlet" className="max-w-5xl mx-auto px-4 py-24">
        <p className="panel-title text-center">the gauntlet</p>
        <h2 className="text-3xl md:text-4xl font-bold text-center mt-2">
          Three challenges. One <span className="gradient-text">funded desk</span>.
        </h2>
        <p className="text-center text-[var(--ink-2)] text-sm mt-3 max-w-lg mx-auto">
          Every phase restarts you at {RULES.startBalance} SOL against a higher target. Same rules,
          same floor, no shortcuts.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-12">
          {RULES.phases.map((p) => (
            <div key={p.num} className="glass glass-hover p-6 relative">
              <span className="mono text-[10px] tracking-[0.25em] text-[var(--cyan)]">
                CHALLENGE 0{p.num}
              </span>
              <div className="mono text-4xl font-bold mt-3">{p.gainLabel}</div>
              <p className="mono text-[11px] text-[var(--ink-3)] mt-2">
                {RULES.startBalance} → {p.target} SOL
              </p>
              <p className="text-[12px] text-[var(--ink-2)] mt-4 leading-relaxed">
                {p.num === 1 && "Prove you can read the market without blowing up."}
                {p.num === 2 && "Double the stack. Consistency starts to matter more than luck."}
                {p.num === 3 && "The final wall. Clear it and you trade our money, not yours."}
              </p>
            </div>
          ))}
          <div className="glass glass-hover p-6 !border-[rgba(167,139,250,0.4)] shadow-[0_0_40px_rgba(167,139,250,0.12)]">
            <span className="mono text-[10px] tracking-[0.25em] text-[var(--violet)]">FUNDED</span>
            <div className="mono text-4xl font-bold mt-3 gradient-text">${funded}</div>
            <p className="mono text-[11px] text-[var(--ink-3)] mt-2">
              {RULES.fundedMultiple}x your ${RULES.entryFeeUsd} entry
            </p>
            <p className="text-[12px] text-[var(--ink-2)] mt-4 leading-relaxed">
              Clear all three and the firm sends ${funded} straight to your Phantom. No strings.
            </p>
          </div>
        </div>
      </section>

      {/* ── THE RULES ────────────────────────────────────────── */}
      <section id="rules" className="max-w-5xl mx-auto px-4 pb-24">
        <p className="panel-title text-center">the rules</p>
        <h2 className="text-3xl md:text-4xl font-bold text-center mt-2">
          Skill is the only edge that survives these.
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-12">
          {[
            {
              k: `${RULES.maxExposure * 100}%`,
              t: "max per token",
              d: "No all-in coin-flips. A single position can never exceed 35% of your equity at entry — diversification is enforced, not suggested.",
            },
            {
              k: `${maxDrawdownPct}%`,
              t: "max drawdown",
              d: `Equity under ${RULES.failFloor} SOL at any moment ends the run instantly. The floor is checked on every price tick.`,
            },
            {
              k: String(RULES.minTrades),
              t: "minimum fills",
              d: "One lucky entry doesn't make a trader. Ten fills minimum before a pass counts.",
            },
            {
              k: "$100K",
              t: "mcap floor",
              d: "Only pump.fun mints above $100K market cap are tradeable — thin pools you could push around with pocket change are out.",
            },
            {
              k: `${RULES.feeRate * 100}%`,
              t: "fee per fill",
              d: "pump.fun charges 1% in the real market, so the sim does too. Zero-cost churn would reward spam, not skill.",
            },
            {
              k: `${RULES.challengeDays}d`,
              t: "time window",
              d: "Each challenge expires after 30 days. Waiting six months for one perfect pump is not a strategy.",
            },
          ].map((r) => (
            <div key={r.t} className="glass glass-hover p-5">
              <div className="mono text-2xl font-bold text-[var(--cyan)]">{r.k}</div>
              <div className="mono text-[11px] tracking-[0.2em] uppercase text-[var(--ink)] mt-1">
                {r.t}
              </div>
              <p className="text-[12px] text-[var(--ink-2)] mt-3 leading-relaxed">{r.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── REAL VS SIMULATED ────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 pb-24">
        <div className="glass p-8 md:p-10">
          <p className="panel-title text-center">read this twice</p>
          <h2 className="text-2xl md:text-3xl font-bold text-center mt-2">
            The prices are real. The stack is not. The funding is.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
            <div>
              <span className="mono text-[11px] tracking-[0.25em] text-[var(--up)]">
                ● WHAT&apos;S REAL
              </span>
              <ul className="mt-4 space-y-3 text-[13px] text-[var(--ink-2)]">
                <li className="flex gap-2.5">
                  <span className="text-up shrink-0">✓</span> Every price, chart and market cap —
                  live on-chain data from Solana DEXes, tick by tick.
                </li>
                <li className="flex gap-2.5">
                  <span className="text-up shrink-0">✓</span> The funded account you unlock, and
                  the USDC profits it pays out.
                </li>
                <li className="flex gap-2.5">
                  <span className="text-up shrink-0">✓</span> Your track record — every run is
                  recorded and stands as proof, not a screenshot.
                </li>
              </ul>
            </div>
            <div>
              <span className="mono text-[11px] tracking-[0.25em] text-[var(--violet)]">
                ◌ WHAT&apos;S SIMULATED
              </span>
              <ul className="mt-4 space-y-3 text-[13px] text-[var(--ink-2)]">
                <li className="flex gap-2.5">
                  <span className="text-[var(--violet)] shrink-0">◌</span> Your{" "}
                  {RULES.startBalance} SOL stack. Fills settle in our book against live quotes — no
                  order ever touches a DEX.
                </li>
                <li className="flex gap-2.5">
                  <span className="text-[var(--violet)] shrink-0">◌</span> Your losses. A blown
                  challenge costs the entry fee, nothing more. No liquidations, no debt, no wallet
                  drain.
                </li>
                <li className="flex gap-2.5">
                  <span className="text-[var(--violet)] shrink-0">◌</span> Market impact. Your size
                  never moves the real chart — which is exactly why the mcap floor exists.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────── */}
      <section id="pricing" className="max-w-3xl mx-auto px-4 pb-24 text-center">
        <p className="panel-title">entry</p>
        <h2 className="text-3xl md:text-4xl font-bold mt-2">One fee. Known downside.</h2>
        <div className="glass glass-hover inline-block mt-10 p-10 text-left w-full max-w-md !border-[rgba(34,211,238,0.3)]">
          <div className="flex items-baseline justify-between">
            <span className="mono text-5xl font-bold">${RULES.entryFeeUsd}</span>
            <span className="mono text-[11px] text-[var(--ink-3)]">usdc · one-time</span>
          </div>
          <div className="flex items-center justify-between mt-3 rounded-lg border border-[rgba(167,139,250,0.35)] bg-[rgba(167,139,250,0.06)] px-4 py-2.5">
            <span className="mono text-[12px] text-[var(--violet)]">
              or ${entryFeeGfUsd()} in ${RULES.token.symbol}
            </span>
            <span className="chip !text-[var(--violet)] !border-[rgba(167,139,250,0.5)]">
              −{RULES.token.discount * 100}% holder discount
            </span>
          </div>
          <ul className="mono text-[12px] text-[var(--ink-2)] mt-6 space-y-2.5">
            <li>▸ full 3-challenge run</li>
            <li>▸ {RULES.startBalance} SOL demo stack per phase</li>
            <li>▸ live pump.fun market data</li>
            <li>
              ▸ pass all three →{" "}
              <span className="gradient-text font-bold">${funded} sent to your Phantom</span>
            </li>
            <li>▸ a fixed cash prize · {RULES.fundedMultiple}x your entry</li>
          </ul>
          <Link href="/enter" className="btn btn-primary w-full !py-4 mt-8 text-center block">
            start challenge 01 ▸
          </Link>
          <p className="mono text-[10px] text-[var(--ink-3)] mt-3 text-center">
            payments are simulated in this preview build
          </p>
        </div>
        <Link
          href="/enter"
          className="glass glass-hover flex items-center justify-between gap-4 max-w-md mx-auto mt-4 px-6 py-4 !border-[rgba(52,211,153,0.3)]"
        >
          <span className="mono text-[12px] text-left">
            <span className="text-up font-bold">free roll — $0 entry.</span>{" "}
            <span className="text-[var(--ink-2)]">
              same gauntlet, ${RULES.freeRewardUsd} funded account.
            </span>
          </span>
          <span className="mono text-[var(--up)]">▸</span>
        </Link>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-4 pb-24">
        <p className="panel-title text-center mb-6">faq</p>
        <div className="space-y-2">
          {[
            {
              q: "Is my wallet ever at risk?",
              a: `No. Trading happens on a simulated balance. The only real transaction is the $${RULES.entryFeeUsd} entry fee — a losing run costs that and nothing else. There is no liquidation and no way a trade can pull funds from you.`,
            },
            {
              q: "Are the prices real?",
              a: "Yes. Every quote and candle comes from live Solana DEX data for actual pump.fun tokens. Your fills are recorded in our book at the live market price, with a 1% fee like the real venue.",
            },
            {
              q: "Why can't I ape 100% into one coin?",
              a: `The ${RULES.maxExposure * 100}% cap keeps the challenge from being a coin-flip contest. The firm funds traders who manage risk, not lottery winners.`,
            },
            {
              q: "What happens after I pass all three?",
              a: `Clear all three challenges and the firm sends you $${funded} in USDC — ${RULES.fundedMultiple}x your $${RULES.entryFeeUsd} entry — straight to the wallet you signed in with. A fixed cash prize, no strings, no profit share. (Simulated in this preview build.)`,
            },
            {
              q: "What if a coin I hold drops below $100K?",
              a: "You can always sell it — no floor is ever applied to an exit, so a collapsing coin can cost you money but can never trap you. You just can't buy more of it while it sits under the floor, and it stays pinned in your token list marked 'sell only'. Your position keeps being priced live, so its losses still count against your equity and can still fail your run.",
            },
            {
              q: "Which coins can I trade?",
              a: `Every pump.fun coin above $100K market cap with at least $15K of real liquidity in its deepest SOL pool. That liquidity floor is why the list is shorter than the raw count of coins above $100K — a coin with a market cap but no liquidity has a price nobody could actually trade at, so it is left out on purpose.`,
            },
            {
              q: `What is the ${RULES.token.symbol} token for?`,
              a: `One thing: paying your entry at a ${RULES.token.discount * 100}% discount — $${entryFeeGfUsd()} instead of $${RULES.entryFeeUsd}. No governance, no gated formats, no claim on anything. It's a discount with a market price. The token is not deployed yet; the whitepaper will carry the mint address once it is.`,
            },
          ].map((f) => (
            <details key={f.q} className="glass glass-hover group">
              <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between mono text-[13px]">
                {f.q}
                <span className="text-[var(--cyan)] group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <p className="px-5 pb-5 text-[13px] text-[var(--ink-2)] leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] px-6 py-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rotate-45 bg-[var(--cyan)]" />
              <span className="mono text-xs tracking-[0.3em] text-[var(--ink-2)]">{BRAND}</span>
            </span>
            <Link href="/whitepaper" className="mono text-[10px] text-[var(--ink-3)] hover:text-[var(--cyan)] transition-colors">
              whitepaper
            </Link>
            <Link href="/leaderboard" className="mono text-[10px] text-[var(--ink-3)] hover:text-[var(--cyan)] transition-colors">
              leaderboard
            </Link>
            <Link href="/terms" className="mono text-[10px] text-[var(--ink-3)] hover:text-[var(--cyan)] transition-colors">
              terms &amp; risk
            </Link>
          </div>
          <p className="mono text-[10px] text-[var(--ink-3)] text-center md:text-right max-w-xl leading-relaxed">
            memecoins are violently volatile. entry fees are at risk and nothing here is investment
            advice. demo trading measures timing, not real execution. never risk what you can&apos;t
            afford to lose. wagmi.
          </p>
        </div>
      </footer>
    </div>
  );
}
