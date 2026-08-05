"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND, RULES } from "@/lib/rules";
import { useGame } from "@/lib/store";
import { useMarket } from "@/lib/market";
import { fmtSol, fmtUsd } from "@/lib/format";

export default function TopBar() {
  const game = useGame();
  const { solUsd, lastTick, source } = useMarket();
  const path = usePathname();
  const feedLive = Date.now() - lastTick < 15_000;

  return (
    <header className="glass !rounded-none !border-x-0 !border-t-0 flex items-center gap-4 px-4 h-[52px] shrink-0 z-40">
      <Link href="/" className="flex items-center gap-2 group">
        <span className="w-2 h-2 rotate-45 bg-[var(--cyan)] shadow-[0_0_12px_var(--cyan-glow)] group-hover:shadow-[0_0_20px_var(--cyan-glow)] transition-shadow" />
        <span className="mono font-bold tracking-[0.3em] text-sm">{BRAND}</span>
      </Link>

      <span className="chip !text-[var(--cyan)] !border-[rgba(34,211,238,0.35)]">
        challenge 0{RULES.phases[game.phase].num} · {RULES.phases[game.phase].gainLabel}
      </span>

      <div className="hidden md:flex items-center gap-2">
        <span className={feedLive ? "live-dot" : "w-[7px] h-[7px] rounded-full bg-[var(--ink-3)]"} />
        <span className="mono text-[10px] tracking-[0.18em] text-[var(--ink-3)]">
          {feedLive ? (source === "helius" ? "LIVE · HELIUS" : "LIVE FEED") : "CONNECTING…"}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        {solUsd > 0 && (
          <span className="mono text-[11px] text-[var(--ink-2)] hidden sm:block">
            SOL {fmtUsd(solUsd)}
          </span>
        )}
        <span className="mono text-[13px]">
          <span className="text-[var(--ink-3)] text-[10px] tracking-[0.18em] mr-1.5">EQUITY</span>
          {fmtSol(game.equity, 2)} <span className="text-[var(--ink-3)] text-[10px]">SOL</span>
        </span>
        <nav className="flex items-center gap-1.5">
          <Link
            href="/terminal"
            className={`chip transition-colors ${path === "/terminal" ? "!text-[var(--cyan)] !border-[rgba(34,211,238,0.4)]" : "hover:text-[var(--ink)]"}`}
          >
            terminal
          </Link>
          <Link
            href="/leaderboard"
            className={`chip transition-colors ${path === "/leaderboard" ? "!text-[var(--cyan)] !border-[rgba(34,211,238,0.4)]" : "hover:text-[var(--ink)]"}`}
          >
            board
          </Link>
          <Link
            href="/dashboard"
            className={`chip transition-colors ${path === "/dashboard" ? "!text-[var(--cyan)] !border-[rgba(34,211,238,0.4)]" : "hover:text-[var(--ink)]"}`}
          >
            dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
