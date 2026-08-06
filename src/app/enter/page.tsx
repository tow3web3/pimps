"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRAND, entryFeeGfUsd, RULES } from "@/lib/rules";
import { useGame } from "@/lib/store";
import { fmtUsd } from "@/lib/format";
import {
  getPreferredWallet,
  getProvider,
  listWallets,
  loadConfig,
  payGf,
  payUsdc,
  setPreferredWallet,
  type DetectedWallet,
  type RuntimeConfig,
} from "@/lib/payments";
import { connectWallet, emailLogin, serverEnter, useAuth, useServerSync } from "@/lib/authClient";
import PrivyConnect, { privyEnabled } from "@/components/PrivyConnect";

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
  useServerSync(); // restore an existing session — no TopBar on this page
  const router = useRouter();
  const game = useGame();
  const authedWallet = useAuth((s) => s.wallet);
  // default to the one lane that can ALWAYS proceed — before the token
  // launches the $GF lane is locked, and a dead default button reads as
  // "the site is broken", not "the token isn't out yet"
  const [method, setMethod] = useState<Method>("free");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [cfg, setCfg] = useState<RuntimeConfig | null>(null);
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setMounted(true);
    // wallets inject asynchronously — a second scan catches the slow ones
    const scan = () => {
      const found = listWallets();
      setWallets(found);
      setWalletId((cur) => cur ?? getPreferredWallet() ?? found[0]?.id ?? null);
    };
    scan();
    const t = setTimeout(scan, 1200);
    timers.current.push(t);
    // poll the runtime config: the $GF lane must open by itself the moment the
    // mint is set in the admin console, with no reload from the visitor
    let stop = false;
    const tick = async () => {
      const c = await loadConfig(true);
      if (!stop) setCfg(c);
    };
    tick();
    const iv = setInterval(tick, 20_000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const live = !!cfg?.paymentsLive && getProvider() !== null;
  const gfLive = !!cfg?.gfLive;

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
  const runServer = async (requireWallet: boolean) => {
    try {
      let wallet: string | null = useAuth.getState().wallet;
      if (!wallet) {
        setLines((l) => [...l, "connecting wallet…"]);
        try {
          wallet = await connectWallet();
          const w = wallet;
          setLines((l) => [...l, `wallet ${w.slice(0, 4)}…${w.slice(-4)} signed in`]);
        } catch (e) {
          // wallet refused / unavailable — a real payment cannot proceed, but a
          // preview seat should never dead-end on it
          if (requireWallet) throw e;
          setLines((l) => [
            ...l,
            `⚠ wallet unavailable (${e instanceof Error ? e.message : "declined"}) — continuing in preview mode`,
          ]);
          runSimulated(method);
          return;
        }
      }
      let txSig: string | undefined;
      const step = (line: string) => setLines((l) => [...l, line]);
      if (method === "gf" && live) {
        txSig = await payGf(gfPrice, step);
      } else if (method === "usdc" && live) {
        txSig = await payUsdc(usdcPrice, step);
      } else if (method !== "free") {
        setLines((l) => [...l, "⚠ preview — treasury not configured, seat granted without transfer"]);
      }
      setLines((l) => [...l, "registering seat with the server…"]);
      const r = await serverEnter(method, txSig);
      if (!r.ok) {
        // already seated? just take them to the desk instead of failing
        if (/already active/i.test(r.error ?? "")) {
          setLines((l) => [...l, "✓ you already have an active run — opening it"]);
          timers.current.push(setTimeout(() => router.push("/terminal"), 700));
          return;
        }
        // session didn't stick (strict-cookie browser) — a free roll should
        // never dead-end, so fall through to the local preview and get them in
        if (method === "free" && /not authenticated/i.test(r.error ?? "")) {
          setLines((l) => [...l, "opening in preview mode…"]);
          runSimulated("free");
          return;
        }
        throw new Error(r.error);
      }
      setLines((l) => [...l, "✓ seat confirmed — the server is watching your run"]);
      timers.current.push(setTimeout(() => router.push("/terminal"), 900));
    } catch (e) {
      // the receipt view unmounts when processing stops, so the error must
      // survive on the ticket view or the user sees a silent bounce-back
      const raw = e instanceof Error ? e.message : "payment failed";
      const friendly = /user rejected|rejected the request/i.test(raw)
        ? "you declined the request in your wallet — nothing was sent"
        : /insufficient|debit an account|no record of a prior credit|custom program error: 0x1\b/i.test(
              raw,
            )
          ? "this wallet doesn't hold enough USDC (plus a little SOL for network fees)"
          : raw;
      setError(friendly);
      setProcessing(false);
    }
  };

  // shared tail of every email path: seat the account, open the terminal
  const afterEmailAuth = async () => {
    setProcessing(true);
    setError(null);
    setLines([
      "✓ signed in — a Solana wallet was created for your account",
      "registering free roll seat…",
    ]);
    try {
      const r = await serverEnter("free");
      if (!r.ok && !/already active/i.test(r.error ?? "")) throw new Error(r.error);
      setLines((l) => [...l, "✓ seat confirmed — welcome to the desk"]);
      timers.current.push(setTimeout(() => router.push("/terminal"), 800));
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign-in failed");
      setProcessing(false);
    }
  };

  // the no-wallet lane: email account → free seat → terminal
  const payWithEmail = async () => {
    if (processing) return;
    setProcessing(true);
    setError(null);
    setLines(["creating your account…"]);
    try {
      await emailLogin(email, password);
      setLines((l) => [...l, `✓ signed in as ${email}`, "registering free roll seat…"]);
      const r = await serverEnter("free");
      if (!r.ok && !/already active/i.test(r.error ?? "")) throw new Error(r.error);
      setLines((l) => [...l, "✓ seat confirmed — welcome to the desk"]);
      timers.current.push(setTimeout(() => router.push("/terminal"), 800));
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign-in failed");
      setProcessing(false);
    }
  };

  const pay = () => {
    if (processing) return;
    if (walletId) setPreferredWallet(walletId);
    setProcessing(true);
    setError(null);
    setLines([]);
    // Every real entry — free roll included — goes through the server with a
    // connected wallet, so the account exists, the run is active and the
    // terminal has something to trade. A wallet is required in all lanes.
    void runServer(true);
  };

  // in live mode the GF lane waits for the token to exist on-chain
  const gfLocked = live && !gfLive;
  const gfUnavailable = gfLocked && method === "gf";

  // never leave the default selection on a locked lane — the CTA would be a
  // disabled button and every click a silent nothing
  useEffect(() => {
    if (gfUnavailable) setMethod("usdc");
  }, [gfUnavailable]);

  const usdcPrice = RULES.entryFeeUsd;
  const gfPrice = entryFeeGfUsd();
  const reentry = mounted && game.status === "failed";

  const tickets: Array<{
    m: Method;
    label: string;
    price: string;
    was?: string;
    copy: string;
    badge?: string;
  }> = [
    {
      m: "free",
      label: "free roll",
      price: "$0",
      copy: `connect a wallet, no payment · same three challenges · win $${RULES.freeRewardUsd} instead of $${RULES.entryFeeUsd * RULES.fundedMultiple}`,
    },
    {
      m: "gf",
      label: `$${RULES.token.symbol} holders`,
      price: fmtUsd(gfPrice),
      was: fmtUsd(usdcPrice),
      badge: `−${RULES.token.discount * 100}%`,
      copy: `paid in ${RULES.token.name} at market rate · every entry is burned — supply only shrinks`,
    },
    {
      m: "usdc",
      label: "usdc classic",
      price: fmtUsd(usdcPrice),
      copy: "plain usdc on solana · no token required",
    },
  ];

  return (
    <div className="paper min-h-dvh flex flex-col">
      <header className="flex items-center justify-between px-5 md:px-10 h-16 border-b-2 border-[var(--ink)]">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rotate-45 bg-[var(--heat)] border border-[var(--ink)]" />
          <span className="display text-lg tracking-tight">{BRAND}</span>
        </Link>
        <Link href="/terminal" className="link-und text-[14px]">
          skip — already seated <span className="btn-arrow">→</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pt-10 pb-16">
        <div className="w-full max-w-3xl">
          <p className="mono text-[11px] tracking-[0.3em] uppercase text-[var(--heat-deep)] text-center">
            {reentry ? `re-entry · attempt #${game.attempt + 1}` : "entry"}
          </p>
          <h1 className="display text-[clamp(40px,7vw,72px)] text-center mt-3">
            {reentry ? (
              <>
                Back for <em className="serif text-[var(--heat)]">another run.</em>
              </>
            ) : (
              <>
                Take your <em className="serif text-[var(--heat)]">seat.</em>
              </>
            )}
          </h1>
          <p className="text-center text-[var(--ink-2)] text-[15px] mt-4 max-w-md mx-auto">
            Play the full gauntlet for free, or enter for real to get funded — pay in{" "}
            {RULES.token.symbol} and the firm takes {RULES.token.discount * 100}% off.
          </p>
          {mounted && (
            <p className="text-center mt-4">
              <span
                className={`chip !text-[11px] !px-3 !py-1 ${
                  live
                    ? "!text-[var(--up)] !border-[var(--up)]"
                    : "!text-[var(--heat-deep)] !border-[var(--heat-deep)]"
                }`}
              >
                {live ? "● payments live · on-chain usdc" : "◌ payments simulated · preview"}
              </span>
            </p>
          )}

          {!processing ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-10">
                {tickets.map((t) => {
                  const on = method === t.m;
                  const locked = t.m === "gf" && gfLocked;
                  return (
                    <button
                      key={t.m}
                      disabled={locked}
                      title={locked ? "opens at token launch" : undefined}
                      onClick={() => {
                        setMethod(t.m);
                        setError(null);
                      }}
                      className={`relative p-6 text-left rounded-[4px] border-2 transition-all duration-150 ${
                        on
                          ? "card-brut card-heat border-[var(--ink)] -translate-y-0.5"
                          : locked
                            ? "border-[var(--border)] bg-transparent opacity-50 cursor-not-allowed"
                            : "border-[var(--border)] bg-transparent hover:border-[var(--ink)]"
                      }`}
                    >
                      {t.badge && (
                        <span className="sticker absolute -top-4 -right-2 px-3 py-1.5 text-[11px]">
                          {t.badge}
                        </span>
                      )}
                      <span
                        className={`mono text-[10px] tracking-[0.25em] uppercase ${
                          on ? "text-[var(--heat-deep)]" : "text-[var(--ink-3)]"
                        }`}
                      >
                        {t.label}
                      </span>
                      <div className="flex items-baseline gap-2 mt-3">
                        <span className="display text-[40px] leading-none">{t.price}</span>
                        {t.was && (
                          <span className="mono text-[13px] text-[var(--ink-3)] line-through">
                            {t.was}
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] text-[var(--ink-2)] mt-3 leading-relaxed">
                        {t.copy}
                      </p>
                      <span
                        className={`mono text-[10px] mt-4 inline-block ${
                          on ? "text-[var(--heat-deep)]" : "text-[var(--ink-3)]"
                        }`}
                      >
                        {locked ? "◌ at token launch" : on ? "● selected" : "○ choose"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <ul className="mono text-[11.5px] text-[var(--ink-2)] mt-8 space-y-2 max-w-md mx-auto">
                <li>▸ {RULES.startBalance} SOL demo stack per phase · live pump.fun prices</li>
                <li>
                  ▸ pass all three → you get paid $
                  {method === "free" ? RULES.freeRewardUsd : RULES.entryFeeUsd * RULES.fundedMultiple}
                  , straight to your wallet
                </li>
                <li>▸ a fixed cash prize · a losing run costs this fee, nothing more</li>
              </ul>

              {/* which wallet signs — only without Privy (its modal has its own list) */}
              {!privyEnabled() && wallets.length > 1 && (
                <div className="max-w-md mx-auto mt-7 flex items-center justify-center gap-2 flex-wrap">
                  <span className="mono text-[10px] tracking-[0.2em] uppercase text-[var(--ink-3)]">
                    sign with
                  </span>
                  {wallets.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setWalletId(w.id);
                        setPreferredWallet(w.id);
                      }}
                      className={`chip !text-[11px] !px-3 !py-1.5 transition-colors ${
                        walletId === w.id
                          ? "!text-[var(--heat-deep)] !border-[var(--heat-deep)]"
                          : "hover:!border-[var(--ink)]"
                      }`}
                    >
                      {walletId === w.id ? "● " : ""}
                      {w.name}
                    </button>
                  ))}
                </div>
              )}
              {mounted && !privyEnabled() && wallets.length === 0 && (
                <p className="mono text-[10px] text-[var(--ink-3)] mt-6 text-center">
                  no Solana wallet detected — install Phantom, Solflare or Backpack, then reload
                </p>
              )}

              <div className="max-w-md mx-auto mt-6">
                {privyEnabled() && !authedWallet ? (
                  <PrivyConnect
                    onDone={method === "free" ? afterEmailAuth : pay}
                    onError={(m) => setError(m)}
                    className="btn-heat w-full !py-4"
                  >
                    {method === "free"
                      ? "Sign in & play free — email or wallet"
                      : gfUnavailable
                        ? `$${RULES.token.symbol} lane opens at token launch`
                        : `Sign in to pay ${fmtUsd(method === "gf" ? gfPrice : usdcPrice)}`}{" "}
                    <span className="btn-arrow">→</span>
                  </PrivyConnect>
                ) : (
                  <button onClick={pay} disabled={gfUnavailable} className="btn-heat w-full !py-4">
                    {method === "free"
                      ? "Connect wallet & play free"
                      : gfUnavailable
                        ? `$${RULES.token.symbol} lane opens at token launch`
                        : `Pay ${fmtUsd(method === "gf" ? gfPrice : usdcPrice)}${
                            method === "gf" ? ` in ${RULES.token.symbol}` : " USDC"
                          }`}{" "}
                    <span className="btn-arrow">→</span>
                  </button>
                )}
                {privyEnabled() && !authedWallet && !gfUnavailable && (
                  <p className="text-center mt-3">
                    <button
                      onClick={pay}
                      className="mono text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)] underline underline-offset-2"
                    >
                      or connect your browser wallet directly (Phantom, Solflare…)
                    </button>
                  </p>
                )}
              </div>
              {error && (
                <div className="max-w-md mx-auto mt-5 border-2 border-[var(--down)] rounded-[4px] px-4 py-3 bg-[rgba(207,59,49,0.07)]">
                  <p className="mono text-[12px] text-[var(--down)]">✕ {error}</p>
                  <p className="mono text-[10px] text-[var(--ink-3)] mt-1.5">
                    you can retry, pick another lane, or take the free roll — it needs no funds at
                    all
                  </p>
                </div>
              )}
              {/* the no-wallet alternative — free roll only. Privy when
                  configured (email login mints an embedded Solana wallet);
                  the homemade email+password form as fallback */}
              {method === "free" && !privyEnabled() && (
                <div className="max-w-md mx-auto mt-5">
                  {!emailMode ? (
                    <p className="text-center">
                      <button
                        onClick={() => setEmailMode(true)}
                        className="link-und text-[13px] text-[var(--ink-2)]"
                      >
                        no wallet? play with email instead <span className="btn-arrow">→</span>
                      </button>
                    </p>
                  ) : (
                    <div className="border-2 border-[var(--border)] rounded-[4px] p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="mono text-[10px] tracking-[0.2em] uppercase text-[var(--ink-3)]">
                          email account · no wallet needed
                        </span>
                        <button
                          onClick={() => setEmailMode(false)}
                          className="mono text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)]"
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="field !text-[13px]"
                        autoComplete="email"
                      />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="password — 8+ characters"
                        className="field !text-[13px]"
                        autoComplete="current-password"
                      />
                      <button
                        onClick={payWithEmail}
                        disabled={!/@/.test(email) || password.length < 8}
                        className="btn-ink w-full !py-3 !text-[14px]"
                      >
                        Create account & play free <span className="btn-arrow">→</span>
                      </button>
                      <p className="mono text-[10px] text-[var(--ink-3)]">
                        existing email signs you back in · you&apos;ll add a wallet only if you
                        win, to receive the money
                      </p>
                    </div>
                  )}
                </div>
              )}

              <p className="mono text-[10px] text-[var(--ink-3)] mt-4 text-center">
                {live && method !== "free"
                  ? "live payment · phantom will ask you to sign a real usdc transfer on solana"
                  : "simulated in this preview build — no wallet is contacted, nothing is signed"}
              </p>
            </>
          ) : (
            /* the receipt printer — a little dark terminal on the paper page */
            <div className="band max-w-md mx-auto mt-10 p-6 rounded-[4px] border-2 border-[var(--ink)] shadow-[5px_5px_0_var(--heat)]">
              <div className="flex items-center gap-2 mb-4">
                <span className="live-dot" />
                <span className="mono text-[10px] tracking-[0.18em] uppercase text-[rgba(242,239,230,0.5)]">
                  processing payment
                </span>
              </div>
              <div className="mono text-[12px] space-y-2.5 min-h-[120px]">
                {lines.map((l, i) => (
                  <p
                    key={i}
                    className={`rise ${
                      l.startsWith("✓") ? "text-[#2be08f]" : "text-[rgba(242,239,230,0.75)]"
                    }`}
                  >
                    <span className="text-[rgba(242,239,230,0.4)] mr-2">{">"}</span>
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
