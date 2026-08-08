import Link from "next/link";
import type { Metadata } from "next";
import { BRAND, entryFeeGfUsd, fundedAccountUsd, RULES } from "@/lib/rules";
import { getConfig, gfMarketLive } from "@/server/config";

// the mint must appear here the moment it is set in the launch console
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${BRAND} — whitepaper`,
  description: `The long-form version: the mechanism, the fill engine, eligibility, accounts and settlement, the price infrastructure, the ${RULES.token.symbol} token, and the honest limits.`,
};

const SECTIONS = [
  ["abstract", "abstract"],
  ["problem", "the problem"],
  ["mechanism", "mechanism"],
  ["engine", "the fill engine"],
  ["floors", "listing floors"],
  ["delisting", "when a token falls"],
  ["accounts", "accounts & integrity"],
  ["infra", "price infrastructure"],
  ["stack", "the stack"],
  ["funded", "the prize"],
  ["payouts", "payouts"],
  ["token", `the ${RULES.token.symbol} token`],
  ["limits", "limits & risks"],
  ["verify", "verifying this document"],
] as const;

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mono text-xl font-bold mt-14 scroll-mt-24 flex items-center gap-3">
      <span className="text-[var(--cyan)]">#</span> {children}
    </h2>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--border)] py-2.5">
      <span className="mono text-[12px] text-[var(--ink-2)]">{k}</span>
      <span className="mono text-[12px] text-[var(--ink)] text-right">{v}</span>
    </div>
  );
}

function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass !border-[rgba(255,90,0,0.3)] p-5 my-6">
      <p className="mono text-[11px] tracking-[0.2em] uppercase text-[var(--amber)]">{title}</p>
      <div className="text-[13px] text-[var(--ink-2)] mt-2 leading-relaxed">{children}</div>
    </div>
  );
}

export default async function Whitepaper() {
  const dd = ((1 - RULES.failFloor / RULES.startBalance) * 100).toFixed(0);
  const cfg = await getConfig();
  const gfMint = (await gfMarketLive(cfg.gfMint)) ? cfg.gfMint : "";

  return (
    <div className="paper min-h-dvh">
      <header className="sticky top-0 z-40 glass !rounded-none !border-x-0 !border-t-0 flex items-center justify-between px-6 h-14">
        <Link href="/" className="flex items-center gap-2">
          <img src="/brand/mark.png" alt="" width={20} height={20} className="shrink-0 -mt-0.5" />
          <span className="mono font-bold tracking-[0.3em] text-sm">{BRAND}</span>
        </Link>
        <span className="panel-title hidden sm:block">whitepaper · v0.2 · preview build</span>
        <Link href="/enter" className="btn btn-cyan !py-2 !px-4">
          take a seat
        </Link>
      </header>

      <div className="max-w-6xl mx-auto flex gap-10 px-4 md:px-8">
        {/* side nav */}
        <nav className="hidden lg:block w-52 shrink-0 sticky top-24 self-start py-10">
          <p className="panel-title mb-3">contents</p>
          <ul className="space-y-1.5">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="mono text-[12px] text-[var(--ink-3)] hover:text-[var(--cyan)] transition-colors"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="flex-1 max-w-2xl py-10 pb-24 text-[14px] leading-relaxed text-[var(--ink-2)]">
          <p className="panel-title">whitepaper</p>
          <h1 className="text-4xl font-bold text-[var(--ink)] mt-2">
            Skill, separated from <span className="gradient-text">capital</span>.
          </h1>
          <p className="mono text-[11px] text-[var(--ink-3)] mt-3">
            every figure on this page is imported from the same constants file the game engine
            executes — the document cannot disagree with the product.
          </p>

          <H2 id="abstract">abstract</H2>
          <p>
            {BRAND} applies the funded-account model — long established in foreign-exchange prop
            trading — to Solana memecoins minted through pump.fun. A trader pays a fixed entry fee,
            receives a simulated {RULES.startBalance} SOL stack, and trades live market prices
            through three consecutive challenges of rising difficulty (
            {RULES.phases.map((p) => p.gainLabel).join(", ")}). Clearing all three pays a fixed cash
            prize of {RULES.fundedMultiple}x the entry fee, in USDC, straight to the trader&apos;s
            wallet.
          </p>
          <p className="mt-4">
            The design goal is a market where skill is separable from capital and from
            luck-of-the-launch, and where the cost of losing is bounded and known before you start.
          </p>

          <H2 id="problem">the problem</H2>
          <p>
            Memecoin trading punishes the wrong things. Position size dominates skill, so the
            trader with the most capital wins the most even when their timing is worse. Losses are
            unbounded, so one bad night removes a participant permanently. And there is no durable
            record of performance: a screenshot of a winning trade says nothing about the losing
            ones.
          </p>
          <p className="mt-4">
            Prop firms solved the structurally identical problem in FX by separating the evaluation
            from the capital: demonstrate skill on a simulated balance under enforced risk limits,
            and the firm supplies real money to whoever passes. {BRAND} keeps that evaluation and
            points it at the most volatile market on earth.
          </p>

          <H2 id="mechanism">mechanism</H2>
          <p>
            Every phase restarts the trader at the same balance against a higher target, so the
            leaderboard compares decisions rather than bankrolls. The full parameter set:
          </p>
          <div className="glass p-5 mt-5">
            <Row k="starting stack" v={`${RULES.startBalance} SOL · every phase`} />
            <Row
              k="targets"
              v={RULES.phases.map((p) => `${p.gainLabel} → ${p.target} SOL`).join("  ·  ")}
            />
            <Row k="max drawdown" v={`${dd}% — equity below ${RULES.failFloor} SOL ends the run`} />
            <Row k="max exposure" v={`${RULES.maxExposure * 100}% of equity per token, at entry`} />
            <Row k="minimum fills" v={`${RULES.minTrades} per phase`} />
            <Row k="time window" v={`${RULES.challengeDays} days per phase`} />
            <Row k="fee per fill" v={`${RULES.feeRate * 100}%, both sides`} />
            <Row k="a failed run" v="restarts from challenge 01 with a new entry" />
          </div>
          <p className="mt-4">
            The exposure cap is measured <b className="text-[var(--ink)]">at entry</b>: a position
            may not be built beyond {RULES.maxExposure * 100}% of equity, but a winner is never
            forced down when it grows past that share on its own. Risk is constrained where it is
            taken — in the sizing decision — not by punishing a correct call.
          </p>
          <p className="mt-4">
            The drawdown floor is checked on every price tick against net liquidation value —
            cash plus every position marked at the live quote with the exit fee already deducted.
            There is no equity number on screen that could not actually be realized.
          </p>

          <H2 id="engine">the fill engine</H2>
          <p>
            Trades are simulated against live market prices. No order is routed to a venue and no
            on-chain swap occurs, so a fill never moves the real market and never competes with the
            trader&apos;s own wallet.
          </p>
          <div className="glass p-5 mt-5">
            <Row k="price source" v="live on-chain market data" />
            <Row k="fee charged" v={`${RULES.feeRate * 100}% per fill — pump.fun's real take`} />
            <Row k="market impact" v="none — size does not move the quote" />
            <Row k="settlement" v="simulated book, not a wallet" />
          </div>
          <p className="mt-4">
            The fee is not revenue — it exists so that overtrading carries the same drag it
            carries in the real market. A simulator with zero cost per trade rewards churn, which
            is the opposite of the skill being measured. The {RULES.maxExposure * 100}% exposure
            cap and the {RULES.minTrades}-fill minimum close the two remaining exploits: the
            all-in coin-flip and the one-lucky-entry pass.
          </p>

          <H2 id="floors">listing floors</H2>
          <p>A coin is buyable only if it clears every floor at the moment of the fill:</p>
          <div className="glass p-5 mt-5">
            <Row k="provenance" v="listed in pump.fun's own registry" />
            <Row k="market cap" v={`≥ $${(RULES.minMcapUsd / 1000).toFixed(0)}K`} />
            <Row k="pool liquidity" v="≥ $15K in the deepest SOL pool" />
            <Row k="real 24h volume" v="≥ $50K — a painted market cap with no volume is excluded" />
            <Row k="quote pricing" v="read from the single deepest pool" />
          </div>
          <p className="mt-4">
            The attack these prevent is straightforward: since fills settle at the quoted price
            regardless of size, the engine is only fair if the underlying market is expensive to
            move. A trader who can push a thin pool for a few hundred dollars could multiply a
            simulated position against a price they created. The floors make that manipulation cost
            more than the prize is worth.
          </p>
          <p className="mt-4">
            Provenance is read from pump.fun&apos;s own registry rather than from the mint address.
            Mints created before the vanity-suffix era — MOODENG, ZEREBRO, TROLL and others — carry
            no <code className="mono text-[12px]">pump</code> ending, and a suffix test would
            silently exclude some of the most liquid tokens on the platform. The suffix is only
            used as a provenance fallback when the registry is unreachable and a secondary indexer
            supplies the universe.
          </p>
          <Callout title="why the floors exclude tokens that look eligible">
            A token can show a $180K market cap and have essentially no liquidity behind it. Its
            quoted price is arithmetic, not a market: nobody could buy or sell a meaningful size at
            it. Those are excluded on purpose. The universe is deliberately smaller than the raw
            count of mints above the market-cap floor, and the gap is entirely made of markets that
            could not honour a fill.
          </Callout>

          <H2 id="delisting">when a token falls under the floor</H2>
          <p>
            Eligibility is evaluated continuously, not once. A token you already hold can drop below
            the market-cap floor while you own it. Exactly three things happen, and nothing else:
          </p>
          <div className="glass p-5 mt-5">
            <Row k="selling" v="always allowed — no floor is ever applied to an exit" />
            <Row k="buying more" v="blocked while it sits under the floor" />
            <Row k="your position" v="still marked at the live price, still counts toward equity" />
          </div>
          <p className="mt-4">
            The first rule is absolute: no market-cap check, liquidity check or eligibility check is
            applied on the sell path, in the engine or in the interface. A collapsing token can cost
            you money, but it can never trap you in a position.
          </p>
          <p className="mt-4">
            The third rule is what keeps the evaluation honest. The position keeps being priced from
            the live market independently of the eligible universe, so its losses continue to count
            against your equity and can breach the drawdown floor and end the run. Holding a
            delisted token is not a way to freeze a losing position.
          </p>
          <p className="mt-4">
            A token you hold stays pinned in the token list whatever the filters say, labelled{" "}
            <b className="text-[var(--ink)]">sell only</b> with its real market cap, so a position
            is never something you have to hunt for. The buy block carries a 10% tolerance band
            around the floor so a token oscillating at the boundary does not flicker between
            tradeable and blocked. If it climbs back above the floor, it becomes buyable again on
            its own.
          </p>

          <H2 id="accounts">accounts &amp; integrity</H2>
          <p>
            An account is a Solana wallet. Signing in means signing a nonce-bearing message with
            that wallet — there is no password, and the address you sign in with is the address any
            payout is sent to.
          </p>
          <p className="mt-4">
            For a signed-in wallet the run is <b className="text-[var(--ink)]">executed on the
            server</b>, not in the browser. Fills are priced from server-side marks, and the
            exposure cap, drawdown floor, minimum-fill count and challenge expiry are enforced in
            the engine before anything is written. The browser holds no authority over the outcome:
            it renders a mirror of a state it cannot modify. Requests without a valid session are
            rejected outright.
          </p>
          <Callout title="the preview mode is not an account">
            Visitors without a wallet can still play the whole gauntlet locally, in the browser, so
            the product can be evaluated without signing anything. That local run is a
            demonstration: it is not recorded, it is trivially modifiable by whoever is running it,
            and it can never qualify for a prize. Only server-side runs count.
          </Callout>

          <H2 id="infra">price infrastructure</H2>
          <p>The feed is layered, each layer replaceable without touching the game:</p>
          <ul className="mt-4 space-y-3">
            <li>
              <b className="text-[var(--ink)]">Discovery.</b> The eligible universe is rebuilt
              every 60 seconds from indexed PumpSwap pools plus trending Solana pools, filtered by
              the listing floors, deduplicated to the deepest pool per mint.
            </li>
            <li>
              <b className="text-[var(--ink)]">Marks.</b> Live prices arrive by polling — a single
              batched call for the whole universe — at ~3s on the free tier. With a Helius API key
              configured, pricing switches to Helius DAS <code className="mono text-[12px]">getAssetBatch</code>{" "}
              at ~1.5s ticks, and the free source drops back to slow metadata refreshes (market
              cap, liquidity, volume, logos). The top bar reports which lane is live.
            </li>
            <li>
              <b className="text-[var(--ink)]">Candles.</b> OHLCV history loads per pool and
              timeframe, then the current candle is painted forward in real time from the mark
              feed between full resyncs every 20 seconds. Clock skew between the client and the
              data source merges into the last candle rather than dropping ticks.
            </li>
            <li>
              <b className="text-[var(--ink)]">Isolation.</b> Every upstream call is proxied and
              cached server-side, so a thousand open terminals cost the same upstream quota as
              one.
            </li>
          </ul>
          <Callout title="planned">
            Per-swap streaming (Helius websockets / Yellowstone gRPC) replaces polling entirely —
            sub-second candles built from raw swap events, the same architecture the paid
            terminals use. The polling lane stays as the fallback.
          </Callout>

          <H2 id="stack">the stack</H2>
          <div className="glass p-5 mt-5">
            <Row k="framework" v="Next.js 16 · React 19 · TypeScript" />
            <Row k="book & rules" v="zustand store, persisted locally in the preview" />
            <Row k="charts" v="DexScreener embedded — the same marks your fills settle on" />
            <Row k="landing scene" v="hand-written WebGL fragment shader, zero deps" />
            <Row k="styling" v="Tailwind v4 + custom glass/HUD design system" />
            <Row k="data proxy" v="edge route handlers with per-source caching" />
          </div>
          <p className="mt-4">
            One deliberate constraint: every game rule lives in a single constants file that both
            the engine and every page import. Change a number once and the terminal, the checkout,
            the landing page and this document all follow. Nothing here is hand-copied.
          </p>

          <H2 id="funded">the prize</H2>
          <p>
            Clearing all three challenges pays a <b className="text-[var(--ink)]">fixed cash
            prize</b> in USDC, sent straight to the wallet you signed in with. There is no funded
            account to manage and no profit share — you win, the firm pays, it is over. Two entry
            tiers, one gauntlet:
          </p>
          <div className="glass p-5 mt-5">
            <Row k="free roll" v={`$0 entry → $${RULES.freeRewardUsd} prize`} />
            <Row
              k="standard"
              v={`$${RULES.entryFeeUsd} entry ($${entryFeeGfUsd()} in ${RULES.token.symbol}) → $${fundedAccountUsd()} prize — ${RULES.fundedMultiple}x`}
            />
          </div>
          <p className="mt-4">
            The rules are identical in both tiers — same targets, same floor, same fills minimum.
            The free roll exists so the gauntlet can be attempted without spending anything; the
            prize scales with the entry, not the difficulty.
          </p>
          <p className="mt-4">
            The economics are a prop-firm classic: the prize is {RULES.fundedMultiple}x the entry,
            so the pool of entry fees is only solvent if fewer than one attempt in{" "}
            {RULES.fundedMultiple} clears all three. The targets ({" "}
            {RULES.phases.map((p) => p.gainLabel).join(", ")} back to back, under the drawdown floor
            and the exposure cap) are set to make that the case. Most attempts fail, by design.
          </p>

          <H2 id="payouts">payouts</H2>
          <p>
            The prize is paid automatically from a dedicated payout wallet — deliberately not the
            treasury — to the address you signed in with, after a short safety window.
          </p>
          <div className="glass p-5 mt-5">
            <Row k="prize" v={`fixed: $${RULES.freeRewardUsd} (free) or $${fundedAccountUsd()} (paid)`} />
            <Row k="destination" v="the wallet you signed in with" />
            <Row k="payment trigger" v="automatic, the moment challenge 03 is secured" />
            <Row k="daily ceiling" v="configurable cap on automated payouts per rolling 24h" />
            <Row k="idempotent" v="one prize per winning run, guarded by the run id" />
          </div>
          <p className="mt-4">
            The prize is recorded against the winning run the instant challenge 03 is cleared, and a
            unique constraint on the run means a replay or a double-submit can never pay it twice.
            The delay and the ceiling exist so an anomaly can be caught before money moves rather
            than after.
          </p>
          <Callout title="preview build">
            In this build entry payments and payouts are simulated end-to-end: the payout worker is
            wired and dormant until a payout wallet is configured, and entries are granted without a
            transfer until a treasury address is set. The mechanism is final; the money is not yet
            connected. This document will say so plainly for as long as that is true.
          </Callout>

          <H2 id="token">the {RULES.token.symbol} token</H2>
          <p>
            {RULES.token.symbol} is the platform token, and unlike most, it has exactly one job:
          </p>
          <div className="glass p-5 mt-5">
            <Row k="utility" v={`pay the entry fee at a ${RULES.token.discount * 100}% discount`} />
            <Row
              k="entry in usdc"
              v={`$${RULES.entryFeeUsd.toFixed(2)}`}
            />
            <Row
              k={`entry in ${RULES.token.symbol}`}
              v={`$${entryFeeGfUsd().toFixed(2)} equivalent, at market rate`}
            />
            <Row k="what happens to it" v="every entry is burned — removed from supply" />
            <Row k="mint" v={gfMint || "not yet deployed"} />
          </div>
          <p className="mt-4">
            No governance theater, no gated formats, no claim on prize pools. Holding{" "}
            {RULES.token.symbol} does one thing: it makes every attempt cheaper. That keeps the
            token&apos;s value proposition honest — it is a discount coupon with a market price,
            and demand for it scales exactly with demand for seats.
          </p>
          <p className="mt-4">
            Entries paid in {RULES.token.symbol} are <b>burned by the firm</b> — sent out of
            circulation, verifiable on-chain. The treasury never re-sells entry tokens into the
            market: every seat bought with {RULES.token.symbol} is supply that permanently
            disappears. Demand for seats becomes deflation, not sell pressure.
          </p>
          <Callout title="not deployed yet">
            The token is not live. Until a mint address appears above — verifiable on-chain — any
            token claiming to be {RULES.token.symbol} is not ours. Nothing on this page is a
            promise of future value, and no supply, allocation or listing is announced here.
          </Callout>

          <H2 id="limits">limits & risks</H2>
          <p>Stated plainly, because a whitepaper that only lists strengths is marketing:</p>
          <ul className="mt-4 space-y-3">
            <li>
              <b className="text-[var(--ink)]">Simulated fills are not real fills.</b> A result
              here demonstrates timing against live prices, not that the same size could have been
              executed on-chain at the same price.
            </li>
            <li>
              <b className="text-[var(--ink)]">Market data is third-party.</b> Prices, pool
              statistics and eligibility checks depend on external indexers. If they are wrong or
              unreachable, quotes and floors are affected.
            </li>
            <li>
              <b className="text-[var(--ink)]">The universe depends on an unofficial API.</b>{" "}
              Eligibility is read from pump.fun&apos;s own listing endpoint, which is not a
              documented public interface and can change without notice. A secondary indexer takes
              over when it does, with narrower coverage.
            </li>
            <li>
              <b className="text-[var(--ink)]">One wallet is not one person.</b> Nothing today
              proves a single human controls a single wallet, so the free tier is farmable by
              someone willing to spread across addresses. It is capped in reward for that reason,
              and per-identity limits are the obvious next step.
            </li>
            <li>
              <b className="text-[var(--ink)]">Payouts depend on an operator.</b> They are
              automated, but from a wallet this firm controls, on infrastructure this firm runs.
              Settlement is not trustless and this document does not claim otherwise.
            </li>
            <li>
              <b className="text-[var(--ink)]">Floors are a deterrent, not a proof.</b> They raise
              the cost of manipulating a thin market above the prize on offer; they do not make
              manipulation impossible.
            </li>
            <li>
              <b className="text-[var(--ink)]">Entry fees will be at risk.</b> Once payments go
              live, a losing run forfeits the fee. Nothing here is investment advice and no return
              is promised.
            </li>
          </ul>

          <H2 id="verify">verifying this document</H2>
          <p>
            Every number above is rendered from{" "}
            <code className="mono text-[12px] text-[var(--cyan)]">src/lib/rules.ts</code> — the
            same constants the fill engine, the risk checks and the checkout execute. If the
            product changes, this page changes in the same commit, or the build fails. Where
            something is simulated or unimplemented, this document says so in an amber box rather
            than implying otherwise.
          </p>

          <div className="flex gap-3 mt-12">
            <Link href="/enter" className="btn btn-primary !px-8 !py-3.5">
              take your seat ▸
            </Link>
            <Link href="/leaderboard" className="btn !px-8 !py-3.5">
              see the board
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
