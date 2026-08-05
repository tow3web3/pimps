import Link from "next/link";
import type { Metadata } from "next";
import { BRAND, fundedAccountUsd, RULES } from "@/lib/rules";

export const metadata: Metadata = {
  title: `${BRAND} — terms & risk disclosure`,
  description: "Terms of service, risk disclosure and eligibility rules.",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mono text-lg font-bold mt-12 text-[var(--ink)]">{children}</h2>;
}

export default function Terms() {
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between px-6 md:px-10 h-16 border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-2 h-2 rotate-45 bg-[var(--cyan)] shadow-[0_0_12px_var(--cyan-glow)]" />
          <span className="mono font-bold tracking-[0.3em] text-sm">{BRAND}</span>
        </Link>
        <Link href="/whitepaper" className="chip hover:text-[var(--ink)] transition-colors">
          whitepaper
        </Link>
      </header>

      <article className="max-w-2xl mx-auto px-4 py-12 pb-24 text-[14px] leading-relaxed text-[var(--ink-2)]">
        <p className="panel-title">legal</p>
        <h1 className="text-3xl font-bold text-[var(--ink)] mt-2">Terms &amp; risk disclosure</h1>

        <div className="glass !border-[rgba(251,191,36,0.35)] p-5 mt-8">
          <p className="mono text-[11px] tracking-[0.2em] uppercase text-[var(--amber)]">
            draft — not legal advice
          </p>
          <p className="text-[13px] mt-2">
            This document is a working draft written by the operator, not by a lawyer. It has not
            been reviewed for compliance in any jurisdiction. It must be reviewed by qualified
            counsel before this platform accepts real money from the public.
          </p>
        </div>

        <H2>1. What this service is</H2>
        <p className="mt-3">
          {BRAND} is a skill evaluation. Participants pay an entry fee to attempt a series of
          trading challenges on a <b className="text-[var(--ink)]">simulated balance</b> priced
          against live public market data. No participant order is ever routed to an exchange, no
          on-chain swap is executed on a participant&apos;s behalf, and no participant ever
          acquires, holds or disposes of the tokens displayed in the interface.
        </p>
        <p className="mt-3">
          Participants who complete all {RULES.phases.length} challenges are offered a{" "}
          <b className="text-[var(--ink)]">funded account</b>: an allocation of the operator&apos;s
          own capital, held and traded on this platform, from which the participant may withdraw a
          share of realized profits. The allocation itself is never transferred to the participant
          and remains the property of the operator at all times.
        </p>

        <H2>2. This is not investment or brokerage activity</H2>
        <p className="mt-3">
          Nothing on this platform is investment advice, a solicitation to buy or sell any asset,
          or a managed-investment offering. The operator is not a broker, dealer, exchange,
          custodian or investment adviser. Participants do not deposit funds for investment: the
          entry fee is a fee for participation and is not held on the participant&apos;s behalf, is
          not returned, and earns nothing.
        </p>

        <H2>3. Eligibility</H2>
        <p className="mt-3">
          You must be at least 18 years old and legally permitted to use this service where you
          live. You may not participate if you are located in, or a resident of, a jurisdiction
          where paid skill contests or this type of service are restricted, nor if you are subject
          to sanctions. You are responsible for determining whether your participation is lawful.
        </p>

        <H2>4. Entry fees</H2>
        <p className="mt-3">
          Entry fees are <b className="text-[var(--ink)]">non-refundable</b> once a run has begun. A
          failed challenge forfeits the fee paid for it and nothing more. The maximum a participant
          can lose is the fee they chose to pay, known in full before payment. There is no leverage,
          no liquidation, no borrowing, and no mechanism by which a participant can owe money to
          the operator.
        </p>

        <H2>5. Rules are enforced by the engine</H2>
        <p className="mt-3">
          The challenge parameters — targets, drawdown floor, exposure cap, minimum fills, time
          window and eligibility floors — are published on the{" "}
          <Link href="/whitepaper" className="text-[var(--cyan)] hover:underline">
            whitepaper
          </Link>{" "}
          and enforced server-side. A breach ends the run automatically. The operator may correct
          results produced by a demonstrable software fault, a market-data fault, or conduct
          described in section 6.
        </p>

        <H2>6. Prohibited conduct</H2>
        <p className="mt-3">The following void a run and any associated reward:</p>
        <ul className="mt-3 space-y-2 list-none">
          {[
            "operating multiple accounts to multiply free entries or coordinate results",
            "manipulating the price or apparent market capitalisation of any listed token, by any means",
            "exploiting a fault in the platform, its data sources or its rules rather than reporting it",
            "automating interaction with the platform in a way that degrades it for others",
            "misrepresenting identity, location or eligibility",
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <span className="text-[var(--down)] shrink-0">✕</span> {t}
            </li>
          ))}
        </ul>

        <H2>7. Funded accounts and withdrawals</H2>
        <p className="mt-3">
          Only realized profit above the funded principal is withdrawable, split at the published
          rate, paid in USDC to the wallet used to sign in. Withdrawals are subject to a minimum, a
          delay between request and payment, and a ceiling per period — all published on the
          whitepaper. The operator may withhold a payment pending review where section 6 conduct is
          suspected, and will state the reason.
        </p>
        <p className="mt-3">
          A funded account is closed if its drawdown floor is breached. Closure costs the
          participant nothing beyond fees already paid.
        </p>

        <H2>8. Availability</H2>
        <p className="mt-3">
          The service depends on third-party market data and public blockchain infrastructure and is
          provided as-is, without any guarantee of availability, accuracy or continuity. Data
          outages may affect quotes, eligibility checks and the ability to trade. The operator does
          not compensate for outcomes attributable to third-party outages, and does not guarantee
          that any challenge can be completed within its time window.
        </p>

        <H2>9. The {RULES.token.symbol} token</H2>
        <p className="mt-3">
          {RULES.token.symbol} grants a discount on entry fees and nothing else. It confers no
          ownership, no governance right, no revenue share and no claim on the operator or on any
          prize pool. It is not offered as an investment and no return on it is promised or implied.
        </p>

        <H2>10. Risk disclosure</H2>
        <div className="glass !border-[rgba(251,113,133,0.35)] p-5 mt-4">
          <ul className="space-y-2.5 text-[13px]">
            {[
              `Memecoins are extremely volatile. Most challenge attempts fail. A ${fundedAccountUsd() / RULES.entryFeeUsd}x funded account is an uncommon outcome, not an expected one.`,
              "Simulated results do not prove that the same size could have been executed on-chain at the same price.",
              "Past results, yours or anyone else's, predict nothing.",
              "Never pay an entry fee with money you cannot afford to lose entirely.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <span className="text-[var(--down)] shrink-0">▲</span> {t}
              </li>
            ))}
          </ul>
        </div>

        <H2>11. Data</H2>
        <p className="mt-3">
          The platform stores the public wallet address used to sign in, the runs and trades made
          with it, and payment records. It does not collect names, emails or documents. Wallet
          addresses and results appear on the public leaderboard in abbreviated form.
        </p>

        <H2>12. Changes</H2>
        <p className="mt-3">
          These terms and the challenge parameters may change. Changes do not apply retroactively to
          a run already in progress. Continued use after a change constitutes acceptance.
        </p>

        <p className="mono text-[11px] text-[var(--ink-3)] mt-12 pt-6 border-t border-[var(--border)]">
          Preview build: entry payments and payouts are currently simulated. No real money moves
          through this platform today, and these terms take full effect when it does.
        </p>
      </article>
    </div>
  );
}
