import Link from "next/link";
import { BRAND, entryFeeGfUsd, fundedAccountUsd, RULES } from "@/lib/rules";
import LiveTape from "@/components/LiveTape";
import Reveal from "@/components/Reveal";
import CountUp from "@/components/CountUp";

/* words rise out of a clipping slot, one after the other */
function Kinetic({ text, from = 0, step = 70 }: { text: string; from?: number; step?: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((w, i) => (
        <span key={i} className="hero-clip">
          <span className="hero-word" style={{ animationDelay: `${from + i * step}ms` }}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </>
  );
}

const SLOGANS = [
  "pass 3 challenges",
  "get paid $300",
  "live pump.fun prices",
  "no liquidations",
  "free roll — win $50",
  "skill is the only edge",
  "$GETFUNDED entries are burned",
  "supply only shrinks",
];

export default function Landing() {
  const funded = fundedAccountUsd();
  const maxDrawdownPct = ((1 - RULES.failFloor / RULES.startBalance) * 100).toFixed(0);

  return (
    <div className="paper min-h-dvh">
      {/* ── HEADER ───────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 md:px-10 h-16 border-b-2 border-[var(--ink)]">
        <div className="flex items-center gap-2.5">
          <img src="/brand/mark.png" alt="" width={22} height={22} className="shrink-0 -mt-0.5" />
          <span className="display text-lg tracking-tight">{BRAND}</span>
        </div>
        <nav className="flex items-center gap-5">
          <Link href="/whitepaper" className="link-und text-[14px] hidden sm:block">
            whitepaper
          </Link>
          <Link href="/leaderboard" className="link-und text-[14px] hidden md:block">
            board
          </Link>
          <Link href="/enter" className="btn-ink !py-2.5 !px-5 !text-[14px]">
            Launch terminal <span className="btn-arrow">→</span>
          </Link>
        </nav>
      </header>

      {/* ── slogan marquee — the opening statement ───────────── */}
      <div className="band border-b-2 border-[var(--ink)] overflow-hidden py-2">
        <div className="tape-track tape-slow">
          {[0, 1].map((copy) => (
            <span key={copy} className="inline-flex items-center">
              {SLOGANS.map((s, i) => (
                <span key={`${copy}-${i}`} className="inline-flex items-center">
                  <span
                    className={`px-5 text-[17px] md:text-[21px] ${
                      i % 2 === 1 ? "serif text-[var(--heat)]" : "display outline-text"
                    }`}
                    style={
                      i % 2 === 1
                        ? undefined
                        : ({
                            "--outline-c": "#f2efe6",
                            WebkitTextStrokeWidth: "1px",
                          } as React.CSSProperties)
                    }
                  >
                    {s}
                  </span>
                  <span className="text-[var(--heat)] text-sm">✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative min-h-[86dvh] flex flex-col">
        <div className="relative flex-1 flex flex-col justify-center px-5 md:px-10 py-16 max-w-6xl mx-auto w-full">
          {/* the sticker — a price tag slapped on the poster */}
          <Link
            href="/enter"
            className="sticker absolute right-4 md:right-10 top-8 md:top-14 px-5 py-3 text-[13px] md:text-[15px] leading-tight text-center"
          >
            free roll
            <br />
            win ${RULES.freeRewardUsd}
          </Link>

          <p className="mono text-[11px] tracking-[0.3em] uppercase text-[var(--ink-3)]">
            <Kinetic text="the memecoin prop firm" from={0} step={40} />
          </p>

          <h1 className="display text-[clamp(52px,10vw,132px)] mt-5">
            <Kinetic text="Trade memecoins." from={150} />
            <br />
            <span className="hero-clip">
              <span className="hero-word" style={{ animationDelay: "520ms" }}>
                Get&nbsp;
              </span>
            </span>
            <span className="hero-clip">
              <span className="hero-word" style={{ animationDelay: "620ms" }}>
                <em className="serif draw-under text-[var(--heat)] pr-[0.06em]">funded.</em>
              </span>
            </span>
          </h1>

          <p
            className="max-w-xl text-[16px] md:text-[18px] leading-relaxed text-[var(--ink-2)] mt-8 rise"
            style={{ animationDelay: "0.8s" }}
          >
            Run a {RULES.startBalance} SOL demo stack on live pump.fun markets. Clear three
            challenges — {RULES.phases.map((p) => p.gainLabel).join(", ")} — without hitting the
            floor, and the firm sends{" "}
            <b className="text-[var(--ink)]">${funded} straight to your Phantom</b>.
          </p>

          <div
            className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mt-9 rise"
            style={{ animationDelay: "0.95s" }}
          >
            <Link href="/enter" className="btn-heat !text-[17px] !px-8 !py-4">
              Start challenge 01 <span className="btn-arrow">→</span>
            </Link>
            <a href="#gauntlet" className="link-und text-[15px]">
              how it works <span className="btn-arrow">↓</span>
            </a>
          </div>

          <div
            className="flex flex-wrap items-baseline gap-x-9 gap-y-3 mt-14 rise"
            style={{ animationDelay: "1.1s" }}
          >
            {[
              [`${RULES.startBalance} SOL`, "demo stack"],
              ["3", "available challenges"],
              [`$${funded}`, "cash prize"],
              ["$0", "at risk while trading"],
            ].map(([k, t]) => (
              <span key={t as string} className="flex items-baseline gap-2">
                <b className="display text-2xl">{k}</b>
                <span className="mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                  {t}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* real prices as decoration */}
        <LiveTape />
      </section>

      {/* ── 01 · THE GAUNTLET ────────────────────────────────── */}
      <section id="gauntlet" className="max-w-6xl mx-auto px-5 md:px-10 pt-24 pb-16">
        <Reveal>
          <p className="mono text-[11px] tracking-[0.3em] uppercase text-[var(--heat-deep)]">
            01 — the gauntlet
          </p>
          <h2 className="display text-[clamp(34px,5.5vw,64px)] mt-3">
            Three challenges. One <em className="serif text-[var(--heat)]">payday.</em>
          </h2>
          <p className="text-[15px] text-[var(--ink-2)] mt-4 max-w-lg">
            Every phase restarts you at {RULES.startBalance} SOL against a higher target. Same
            rules, same floor, no shortcuts.
          </p>
        </Reveal>

        <div className="mt-12">
          {RULES.phases.map((p, i) => (
            <Reveal key={p.num} delay={i * 90}>
              <div className="group grid grid-cols-[auto_1fr] md:grid-cols-[90px_150px_1fr_auto] items-baseline gap-x-6 gap-y-1 border-t-2 border-[var(--ink)] py-7 transition-colors hover:bg-[rgba(19,17,16,0.03)]">
                <span className="display text-[44px] md:text-[56px] leading-none text-[var(--ink-3)] group-hover:text-[var(--heat)] transition-colors">
                  0{p.num}
                </span>
                <span className="display text-[34px] md:text-[44px]">{p.gainLabel}</span>
                <p className="col-span-2 md:col-span-1 text-[14px] text-[var(--ink-2)] max-w-md">
                  {p.num === 1 && `Prove you can read the market without blowing up — first step toward the $${funded}.`}
                  {p.num === 2 && `Double the stack — one challenge left between you and the $${funded}.`}
                  {p.num === 3 && `The final wall. Clear it and you get paid $${funded}, cash.`}
                </p>
                <span className="mono text-[12px] text-[var(--ink-3)] justify-self-end hidden md:block">
                  {RULES.startBalance} → {p.target} SOL
                </span>
              </div>
            </Reveal>
          ))}

          {/* the payoff */}
          <Reveal delay={280}>
            <div className="card-brut card-heat mt-10 p-8 md:p-10 flex flex-col md:flex-row md:items-center gap-6 !bg-[#131110] !text-[#f2efe6]">
              <div className="flex-1">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-[rgba(242,239,230,0.5)]">
                  pass all three
                </p>
                <div className="display text-[clamp(56px,9vw,110px)] text-[var(--heat)] leading-none mt-2">
                  $<CountUp to={funded} className="!font-[inherit]" />
                </div>
                <p className="text-[15px] text-[rgba(242,239,230,0.75)] mt-3 max-w-md">
                  sent <em className="serif text-[#f2efe6]">straight to your Phantom.</em> A fixed
                  cash prize — no profit split, no strings, no funded-account fine print.
                </p>
              </div>
              <Link href="/enter" className="btn-heat shrink-0 !border-[#f2efe6]">
                Take your seat <span className="btn-arrow">→</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 02 · HOUSE RULES ─────────────────────────────────── */}
      <section id="rules" className="max-w-6xl mx-auto px-5 md:px-10 pt-24 pb-24">
        <Reveal>
          <p className="mono text-[11px] tracking-[0.3em] uppercase text-[var(--heat-deep)]">
            02 — house rules
          </p>
          <h2 className="display text-[clamp(34px,5.5vw,64px)] mt-3 max-w-3xl">
            Skill is the only edge that <em className="serif text-[var(--heat)]">survives.</em>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
          {[
            {
              k: `${RULES.maxExposure * 100}%`,
              t: "max per token",
              d: "No all-in coin-flips. A single position can never exceed a third of your equity at entry — diversification is enforced, not suggested.",
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
          ].map((r, i) => (
            <Reveal key={r.t} delay={(i % 3) * 90}>
              <div className="card-brut p-6 h-full">
                <div className="display text-[40px] text-[var(--heat-deep)]">{r.k}</div>
                <div className="mono text-[10px] tracking-[0.25em] uppercase mt-1">{r.t}</div>
                <p className="text-[13.5px] text-[var(--ink-2)] mt-4 leading-relaxed">{r.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── REAL VS SIMULATED — ink band ─────────────────────── */}
      <section className="band border-y-2 border-[var(--ink)] py-20">
        <div className="max-w-6xl mx-auto px-5 md:px-10">
          <Reveal>
            <p className="mono text-[11px] tracking-[0.3em] uppercase text-[rgba(242,239,230,0.45)]">
              read this twice
            </p>
            <h2 className="display text-[clamp(30px,4.5vw,54px)] mt-3 max-w-3xl">
              The prices are <em className="serif text-[#2be08f]">real.</em> The stack is
              simulated. The money is <em className="serif text-[var(--heat)]">real.</em>
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mt-12">
            <Reveal delay={80}>
              <span className="mono text-[11px] tracking-[0.25em] text-[#2be08f]">
                ● WHAT&apos;S REAL
              </span>
              <ul className="mt-5 space-y-4 text-[14.5px] text-[rgba(242,239,230,0.75)]">
                <li className="border-l-2 border-[#2be08f] pl-4">
                  Every price, chart and market cap — live on-chain data from Solana DEXes, tick by
                  tick.
                </li>
                <li className="border-l-2 border-[#2be08f] pl-4">
                  The ${funded} cash prize the firm sends to your wallet when you clear all three.
                </li>
                <li className="border-l-2 border-[#2be08f] pl-4">
                  Your track record — every run is recorded and stands as proof, not a screenshot.
                </li>
              </ul>
            </Reveal>
            <Reveal delay={160}>
              <span className="mono text-[11px] tracking-[0.25em] text-[var(--heat)]">
                ◌ WHAT&apos;S SIMULATED
              </span>
              <ul className="mt-5 space-y-4 text-[14.5px] text-[rgba(242,239,230,0.75)]">
                <li className="border-l-2 border-[var(--heat)] pl-4">
                  Your {RULES.startBalance} SOL stack. Fills settle in our book against live quotes
                  — no order ever touches a DEX.
                </li>
                <li className="border-l-2 border-[var(--heat)] pl-4">
                  Your losses. A blown challenge costs the entry fee, nothing more. No
                  liquidations, no debt, no wallet drain.
                </li>
                <li className="border-l-2 border-[var(--heat)] pl-4">
                  Market impact. Your size never moves the real chart — which is exactly why the
                  mcap floor exists.
                </li>
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 03 · TICKETS ─────────────────────────────────────── */}
      <section id="pricing" className="max-w-5xl mx-auto px-5 md:px-10 pt-24 pb-24">
        <Reveal>
          <p className="mono text-[11px] tracking-[0.3em] uppercase text-[var(--heat-deep)]">
            03 — take your seat
          </p>
          <h2 className="display text-[clamp(34px,5.5vw,64px)] mt-3">
            One fee. Known <em className="serif text-[var(--heat)]">downside.</em>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-14 items-stretch">
          {/* free ticket */}
          <Reveal delay={60} className="h-full">
            <Link href="/enter" className="card-brut p-8 flex flex-col h-full">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--ink-3)]">
                free roll
              </p>
              <div className="display text-[64px] leading-none mt-3">$0</div>
              <p className="text-[14px] text-[var(--ink-2)] mt-4 leading-relaxed">
                No payment. The same three challenges — pass them all and{" "}
                <b className="text-[var(--ink)]">you get paid ${RULES.freeRewardUsd}, cash</b>.
              </p>
              <span className="link-und text-[15px] mt-auto pt-8 self-start">
                play free <span className="btn-arrow">→</span>
              </span>
            </Link>
          </Reveal>

          {/* paid ticket */}
          <Reveal delay={140} className="h-full">
            <Link href="/enter" className="card-brut card-heat p-8 flex flex-col h-full relative">
              <span className="sticker absolute -top-5 -right-3 px-4 py-2 text-[12px]">
                −{RULES.token.discount * 100}% in ${RULES.token.symbol}
              </span>
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--heat-deep)]">
                the real gauntlet
              </p>
              <div className="flex items-baseline gap-3 mt-3">
                <span className="display text-[64px] leading-none">${RULES.entryFeeUsd}</span>
                <span className="display text-[26px] text-[var(--heat-deep)]">
                  or ${entryFeeGfUsd()}
                </span>
              </div>
              <p className="text-[14px] text-[var(--ink-2)] mt-4 leading-relaxed">
                USDC on Solana, or ${RULES.token.symbol} at −{RULES.token.discount * 100}% —{" "}
                <b className="text-[var(--ink)]">every ${RULES.token.symbol} entry is burned</b>,
                so playing shrinks the supply. Pass all three and{" "}
                <b className="text-[var(--heat-deep)]">you get paid ${funded}, straight to your
                wallet</b> — {RULES.fundedMultiple}x your entry. A losing run costs the fee,
                nothing more.
              </p>
              <span className="btn-heat !mt-8 mt-auto self-start !text-[15px]">
                start challenge 01 <span className="btn-arrow">→</span>
              </span>
            </Link>
          </Reveal>
        </div>
        <p className="mono text-[10px] text-[var(--ink-3)] mt-6 text-center">
          payments are simulated in this preview build
        </p>
      </section>

      {/* ── 04 · FAQ ─────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-5 md:px-10 pb-28">
        <Reveal>
          <p className="mono text-[11px] tracking-[0.3em] uppercase text-[var(--heat-deep)]">
            04 — questions
          </p>
        </Reveal>
        <div className="mt-8">
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
              a: `One thing: paying your entry at a ${RULES.token.discount * 100}% discount — $${entryFeeGfUsd()} instead of $${RULES.entryFeeUsd}. And every entry paid in ${RULES.token.symbol} is burned by the firm: those tokens leave circulation for good, so playing shrinks the supply instead of feeding sell pressure. No governance, no gated formats, no claim on anything. The token is not deployed yet; the whitepaper will carry the mint address once it is.`,
            },
          ].map((f, i) => (
            <Reveal key={f.q} delay={i * 40}>
              <details className="group border-t-2 border-[var(--ink)] last:border-b-2">
                <summary
                  className="cursor-pointer list-none py-5 flex items-center justify-between gap-4 text-[16px] font-semibold"
                  style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
                >
                  {f.q}
                  <span className="display text-[22px] text-[var(--heat)] group-open:rotate-45 transition-transform shrink-0">
                    +
                  </span>
                </summary>
                <p className="pb-6 text-[14px] text-[var(--ink-2)] leading-relaxed max-w-2xl">
                  {f.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="band border-t-2 border-[var(--ink)] pt-14 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 md:px-10">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
            <div className="flex items-center gap-5">
              <Link
                href="/whitepaper"
                className="link-und text-[14px] !text-[rgba(242,239,230,0.7)]"
              >
                whitepaper
              </Link>
              <Link
                href="/leaderboard"
                className="link-und text-[14px] !text-[rgba(242,239,230,0.7)]"
              >
                leaderboard
              </Link>
              <Link href="/terms" className="link-und text-[14px] !text-[rgba(242,239,230,0.7)]">
                terms &amp; risk
              </Link>
            </div>
            <p className="mono text-[10px] text-[rgba(242,239,230,0.45)] max-w-md leading-relaxed md:text-right">
              memecoins are violently volatile. entry fees are at risk and nothing here is
              investment advice. demo trading measures timing, not real execution. never risk what
              you can&apos;t afford to lose. wagmi.
            </p>
          </div>
        </div>
        <div
          className="display text-[clamp(80px,16vw,220px)] leading-[0.8] text-center select-none mt-10 -mb-4 outline-text"
          style={{ "--outline-c": "rgba(242,239,230,0.4)" } as React.CSSProperties}
          aria-hidden
        >
          {BRAND}
        </div>
      </footer>
    </div>
  );
}
