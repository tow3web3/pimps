"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND, RULES } from "@/lib/rules";
import { useGame } from "@/lib/store";
import { useMarket } from "@/lib/market";
import { fmtSol, fmtUsd } from "@/lib/format";
import { connectWallet, disconnectWallet, useAuth, useServerSync } from "@/lib/authClient";

export default function TopBar() {
  useServerSync();
  const game = useGame();
  const { wallet, connecting } = useAuth();
  const { solUsd, lastTick, source } = useMarket();
  const path = usePathname();
  const feedLive = Date.now() - lastTick < 15_000;

  return (
    <header className="glass !rounded-none !border-x-0 !border-t-0 flex items-center gap-2 sm:gap-4 px-2 sm:px-4 h-[52px] shrink-0 z-40 overflow-hidden">
      <Link href="/" className="flex items-center gap-2 group shrink-0">
        <span className="w-2 h-2 rotate-45 bg-[var(--cyan)] group-hover: transition-shadow" />
        <span className="mono font-bold tracking-[0.18em] sm:tracking-[0.3em] text-[11px] sm:text-sm">
          {BRAND}
        </span>
      </Link>

      <span className="chip !text-[var(--cyan)] !border-[rgba(255,176,0,0.35)] hidden sm:inline-block">
        {game.funded
          ? `funded · ${fmtUsd(game.funded.principalUsd)}`
          : `challenge 0${RULES.phases[game.phase].num} · ${RULES.phases[game.phase].gainLabel}`}
      </span>

      <div className="hidden md:flex items-center gap-2">
        <span className={feedLive ? "live-dot" : "w-[7px] h-[7px] rounded-full bg-[var(--ink-3)]"} />
        <span className="mono text-[10px] tracking-[0.18em] text-[var(--ink-3)]">
          {feedLive ? (source === "helius" ? "LIVE · HELIUS" : "LIVE FEED") : "CONNECTING…"}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-4 min-w-0">
        {solUsd > 0 && (
          <span className="mono text-[11px] text-[var(--ink-2)] hidden md:block">
            SOL {fmtUsd(solUsd)}
          </span>
        )}
        <span className="mono text-[12px] sm:text-[13px] whitespace-nowrap">
          <span className="text-[var(--ink-3)] text-[10px] tracking-[0.18em] mr-1.5 hidden sm:inline">
            EQUITY
          </span>
          {fmtSol(game.equity, 2)} <span className="text-[var(--ink-3)] text-[10px]">SOL</span>
        </span>
        <button
          onClick={() => {
            if (wallet) void disconnectWallet();
            else connectWallet().catch(() => {});
          }}
          className={`chip shrink-0 whitespace-nowrap transition-colors ${
            wallet
              ? "!text-[var(--up)] !border-[rgba(0,214,143,0.45)] hover:!text-[var(--down)] hover:!border-[rgba(255,82,82,0.45)]"
              : "!text-[var(--cyan)] !border-[rgba(255,176,0,0.45)] hover:bg-[rgba(255,176,0,0.08)]"
          }`}
          title={wallet ? "click to disconnect" : "sign in with your Solana wallet"}
        >
          {connecting ? (
            "connecting…"
          ) : wallet ? (
            `◆ ${wallet.slice(0, 4)}…${wallet.slice(-4)}`
          ) : (
            <>
              <span className="sm:hidden">◆ connect</span>
              <span className="hidden sm:inline">connect wallet</span>
            </>
          )}
        </button>
        <nav className="hidden sm:flex items-center gap-1.5">
          <Link
            href="/terminal"
            className={`chip transition-colors ${path === "/terminal" ? "!text-[var(--cyan)] !border-[rgba(255,176,0,0.4)]" : "hover:text-[var(--ink)]"}`}
          >
            terminal
          </Link>
          <Link
            href="/leaderboard"
            className={`chip transition-colors ${path === "/leaderboard" ? "!text-[var(--cyan)] !border-[rgba(255,176,0,0.4)]" : "hover:text-[var(--ink)]"}`}
          >
            board
          </Link>
          <Link
            href="/dashboard"
            className={`chip transition-colors ${path === "/dashboard" ? "!text-[var(--cyan)] !border-[rgba(255,176,0,0.4)]" : "hover:text-[var(--ink)]"}`}
          >
            dashboard
          </Link>
        </nav>
        {/* compact nav for phones */}
        <nav className="flex sm:hidden items-center gap-1">
          {(
            [
              ["/terminal", "◪"],
              ["/leaderboard", "▤"],
              ["/dashboard", "◫"],
            ] as const
          ).map(([href, icon]) => (
            <Link
              key={href}
              href={href}
              className={`chip !px-2.5 !text-[13px] ${path === href ? "!text-[var(--cyan)] !border-[rgba(255,176,0,0.4)]" : ""}`}
            >
              {icon}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
