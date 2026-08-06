"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { fmtCompact } from "@/lib/format";
import CopyButton from "./CopyButton";

interface TokenProfile {
  mint: string;
  symbol: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  creator: string | null;
  createdAt: number | null;
  athMcapUsd: number | null;
  mcapUsd: number | null;
  liqUsd: number | null;
  vol24Usd: number | null;
  totalSupply: number | null;
  replyCount: number | null;
  pairAddress: string | null;
  socials: { twitter?: string; telegram?: string; website?: string };
  graduated: boolean;
}

function age(ts: number | null): string {
  if (!ts) return "—";
  const d = (Date.now() - ts) / 86_400_000;
  if (d < 1) return `${Math.max(1, Math.floor(d * 24))}h old`;
  if (d < 30) return `${Math.floor(d)}d old`;
  if (d < 365) return `${Math.floor(d / 30)}mo old`;
  return `${(d / 365).toFixed(1)}y old`;
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="chip hover:!text-[var(--cyan)] hover:!border-[rgba(255,90,0,0.4)] transition-colors"
    >
      {label} ↗
    </a>
  );
}

export default function TokenInfoPanel({ mint }: { mint: string }) {
  const [info, setInfo] = useState<TokenProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    setInfo(null);
    fetch(`/api/token/${mint}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!stop) {
          setInfo(j);
          setLoading(false);
        }
      })
      .catch(() => !stop && setLoading(false));
    return () => {
      stop = true;
    };
  }, [mint]);

  const hasSocial = info && (info.socials.twitter || info.socials.telegram || info.socials.website);

  return (
    <div className="glass flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)]">
        <span className="panel-title">token info</span>
        {info?.graduated && (
          <span className="chip !text-[var(--up)] !border-[rgba(0,214,143,0.35)]">
            ✓ graduated
          </span>
        )}
      </div>

      <div className="overflow-y-auto min-h-0">
        {loading && (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 rounded bg-[rgba(19,17,16,0.05)] animate-pulse" />
            ))}
          </div>
        )}

        {!loading && info && (
          <div className="p-3 space-y-3">
            {info.bannerUrl && (
              <div className="relative h-20 rounded-lg overflow-hidden border border-[var(--border)]">
                <Image
                  src={info.bannerUrl}
                  alt=""
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            )}

            {info.description && (
              <p className="text-[12px] text-[var(--ink-2)] leading-relaxed line-clamp-4">
                {info.description}
              </p>
            )}

            {hasSocial && (
              <div className="flex flex-wrap gap-1.5">
                {info.socials.website && <SocialLink href={info.socials.website} label="website" />}
                {info.socials.twitter && <SocialLink href={info.socials.twitter} label="x / twitter" />}
                {info.socials.telegram && <SocialLink href={info.socials.telegram} label="telegram" />}
              </div>
            )}

            {/* contract address — the copy-paste you asked for */}
            <div className="rounded-lg border border-[var(--border)] px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="panel-title">contract</span>
                <CopyButton value={info.mint} label="copy" className="!text-[10px]" />
              </div>
              <div className="mono text-[11px] text-[var(--ink-2)] break-all mt-1">
                {info.mint}
              </div>
            </div>

            {/* dev / creator */}
            {info.creator && (
              <div className="rounded-lg border border-[var(--border)] px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="panel-title">dev / creator</span>
                  <CopyButton value={info.creator} label="copy" className="!text-[10px]" />
                </div>
                <div className="mono text-[11px] text-[var(--ink-2)] break-all mt-1">
                  {info.creator}
                </div>
                <a
                  href={`https://solscan.io/account/${info.creator}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono text-[10px] text-[var(--cyan)] hover:underline mt-1 inline-block"
                >
                  view dev on solscan ↗
                </a>
              </div>
            )}

            {/* stats grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: "age", v: age(info.createdAt) },
                { k: "market cap", v: info.mcapUsd ? fmtCompact(info.mcapUsd) : "—" },
                {
                  k: "ath mcap",
                  v: info.athMcapUsd ? fmtCompact(info.athMcapUsd) : "—",
                  cls: "text-[var(--violet)]",
                },
                { k: "liquidity", v: info.liqUsd ? fmtCompact(info.liqUsd) : "—" },
                { k: "24h volume", v: info.vol24Usd ? fmtCompact(info.vol24Usd) : "—" },
                {
                  k: "supply",
                  v: info.totalSupply
                    ? info.totalSupply >= 1e9
                      ? `${(info.totalSupply / 1e9).toFixed(1)}B`
                      : `${(info.totalSupply / 1e6).toFixed(0)}M`
                    : "—",
                },
              ].map((s) => (
                <div key={s.k} className="rounded-lg border border-[var(--border)] px-2.5 py-2">
                  <div className="panel-title">{s.k}</div>
                  <div className={`mono text-[12px] mt-0.5 ${s.cls ?? ""}`}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* external links */}
            <div className="flex flex-wrap gap-1.5">
              <a
                href={`https://pump.fun/coin/${info.mint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="chip hover:!text-[var(--up)] hover:!border-[rgba(0,214,143,0.4)] transition-colors"
              >
                pump.fun ↗
              </a>
              {info.pairAddress && (
                <a
                  href={`https://dexscreener.com/solana/${info.pairAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip hover:!text-[var(--cyan)] hover:!border-[rgba(255,90,0,0.4)] transition-colors"
                >
                  dexscreener ↗
                </a>
              )}
              <a
                href={`https://solscan.io/token/${info.mint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="chip hover:!text-[var(--cyan)] hover:!border-[rgba(255,90,0,0.4)] transition-colors"
              >
                solscan ↗
              </a>
            </div>

            <p className="mono text-[9px] text-[var(--ink-3)] leading-relaxed pt-1">
              do your own research · a dev holding a large share, or a very new pool, is a risk the
              floor cannot fully remove
            </p>
          </div>
        )}

        {!loading && !info && (
          <p className="mono text-xs text-[var(--ink-3)] p-4 text-center">
            no profile data for this token
          </p>
        )}
      </div>
    </div>
  );
}
