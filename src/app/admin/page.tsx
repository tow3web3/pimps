"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BRAND, entryFeeGfUsd, RULES } from "@/lib/rules";

interface Cfg {
  treasuryWallet: string;
  gfMint: string;
  gfDecimals: number;
  gfPriceUsd?: number | null;
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [mint, setMint] = useState("");
  const [treasury, setTreasury] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // keep the secret for the session only — never persisted
  useEffect(() => {
    const s = sessionStorage.getItem("gf_admin");
    if (s) setSecret(s);
  }, []);

  const load = async (s: string) => {
    const r = await fetch("/api/admin/config", { headers: { "x-admin-secret": s } });
    if (!r.ok) {
      setMsg({ ok: false, text: "secret refused" });
      setCfg(null);
      return;
    }
    const j = await r.json();
    setCfg(j);
    setMint(j.gfMint ?? "");
    setTreasury(j.treasuryWallet ?? "");
    sessionStorage.setItem("gf_admin", s);
    setMsg(null);
  };

  const save = async (patch: Record<string, string>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) setMsg({ ok: false, text: j.error ?? "failed" });
      else {
        setCfg({ ...j.config, gfPriceUsd: j.gfPriceUsd });
        setMsg({ ok: true, text: j.note ?? "saved" });
      }
    } finally {
      setBusy(false);
    }
  };

  const gfTokens =
    cfg?.gfPriceUsd && cfg.gfPriceUsd > 0 ? entryFeeGfUsd() / cfg.gfPriceUsd : null;

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between px-6 h-16 border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-2 h-2 rotate-45 bg-[var(--cyan)]" />
          <span className="mono font-bold tracking-[0.3em] text-sm">{BRAND}</span>
        </Link>
        <span className="chip !text-[var(--amber)] !border-[rgba(255,90,0,0.4)]">
          launch console
        </span>
      </header>

      <main className="max-w-xl mx-auto px-4 py-12">
        <p className="panel-title">operator</p>
        <h1 className="text-2xl font-bold mt-1">Launch console</h1>
        <p className="mono text-[11px] text-[var(--ink-2)] mt-2 leading-relaxed">
          changes take effect on the next request — no rebuild, no restart, no downtime.
        </p>

        {/* auth */}
        <div className="glass p-5 mt-8">
          <span className="panel-title">admin secret</span>
          <div className="flex gap-2 mt-2">
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="ADMIN_SECRET from .env.local"
              className="field"
            />
            <button onClick={() => load(secret)} className="btn btn-cyan shrink-0">
              unlock
            </button>
          </div>
        </div>

        {cfg && (
          <>
            {/* current state */}
            <div className="glass p-5 mt-4">
              <span className="panel-title">current state</span>
              <div className="mt-3 space-y-2 mono text-[12px]">
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--ink-2)]">treasury</span>
                  <span className={cfg.treasuryWallet ? "text-up" : "text-[var(--amber)]"}>
                    {cfg.treasuryWallet
                      ? `✓ ${cfg.treasuryWallet.slice(0, 6)}…${cfg.treasuryWallet.slice(-6)}`
                      : "◌ not set — payments simulated"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--ink-2)]">${RULES.token.symbol} mint</span>
                  <span className={cfg.gfMint ? "text-up" : "text-[var(--amber)]"}>
                    {cfg.gfMint ? `✓ ${cfg.gfMint.slice(0, 6)}…${cfg.gfMint.slice(-6)}` : "◌ not launched"}
                  </span>
                </div>
                {cfg.gfMint && (
                  <>
                    <div className="flex justify-between gap-3">
                      <span className="text-[var(--ink-2)]">decimals (on-chain)</span>
                      <span>{cfg.gfDecimals}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-[var(--ink-2)]">market price</span>
                      <span className={cfg.gfPriceUsd ? "" : "text-[var(--amber)]"}>
                        {cfg.gfPriceUsd ? `$${cfg.gfPriceUsd.toPrecision(4)}` : "no pool indexed yet"}
                      </span>
                    </div>
                    {gfTokens && (
                      <div className="flex justify-between gap-3 pt-2 border-t border-[var(--border)]">
                        <span className="text-[var(--ink-2)]">entry costs</span>
                        <span className="gradient-text font-bold">
                          {gfTokens.toLocaleString("en-US", { maximumFractionDigits: 0 })} $
                          {RULES.token.symbol}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* the launch action */}
            <div className="glass p-5 mt-4 !border-[rgba(255,162,107,0.4)]">
              <span className="panel-title !text-[var(--violet)]">
                ${RULES.token.symbol} contract address
              </span>
              <p className="mono text-[10px] text-[var(--ink-3)] mt-1.5 leading-relaxed">
                paste the mint the moment the token launches. decimals are read from the chain and
                the discounted lane opens by itself as soon as a pool is indexed.
              </p>
              <input
                value={mint}
                onChange={(e) => setMint(e.target.value)}
                placeholder="the CA, base58"
                className="field mt-3 !text-[12px]"
              />
              <button
                onClick={() => save({ gfMint: mint })}
                disabled={busy || !mint.trim()}
                className="btn btn-primary w-full !py-3 mt-3"
              >
                {busy ? "checking on-chain…" : "go live ▸"}
              </button>
            </div>

            {/* treasury */}
            <div className="glass p-5 mt-4">
              <span className="panel-title">treasury wallet (receives entry fees)</span>
              <input
                value={treasury}
                onChange={(e) => setTreasury(e.target.value)}
                placeholder="public address only — never a private key"
                className="field mt-2 !text-[12px]"
              />
              <button
                onClick={() => save({ treasuryWallet: treasury })}
                disabled={busy || !treasury.trim()}
                className="btn btn-cyan w-full !py-3 mt-3"
              >
                save treasury
              </button>
            </div>

            {msg && (
              <p
                className={`mono text-[11px] rounded-lg px-3 py-2 mt-4 border ${
                  msg.ok
                    ? "text-up border-[rgba(0,214,143,0.3)] bg-[rgba(0,214,143,0.06)]"
                    : "text-down border-[rgba(255,82,82,0.3)] bg-[rgba(255,82,82,0.06)]"
                }`}
              >
                {msg.ok ? "✓ " : "✕ "}
                {msg.text}
              </p>
            )}
          </>
        )}

        {!cfg && msg && !msg.ok && (
          <p className="mono text-[11px] text-down mt-4">✕ {msg.text}</p>
        )}
      </main>
    </div>
  );
}
