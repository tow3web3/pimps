"use client";

// Wallet session + server-game sync. Once a wallet is connected, the zustand
// game store becomes a mirror of the server state — the browser renders, the
// server decides.

import { useEffect, useRef } from "react";
import { create } from "zustand";
import bs58 from "bs58";
import { getProvider, withWalletTimeout } from "./payments";
import { useGame } from "./store";

interface AuthState {
  wallet: string | null;
  connecting: boolean;
}

export const useAuth = create<AuthState>(() => ({ wallet: null, connecting: false }));

export async function refreshServerState(): Promise<boolean> {
  const res = await fetch("/api/game/state");
  if (!res.ok) return false;
  useGame.getState().hydrateServer(await res.json());
  return true;
}

export async function connectWallet(): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("no Solana wallet found — install Phantom");
  useAuth.setState({ connecting: true });
  try {
    // 60s to approve the connect popup; if the extension's bridge is dead it
    // rejects here instead of hanging the whole page forever
    const { publicKey } = await withWalletTimeout(provider.connect(), 60_000, "connect");
    const wallet = publicKey.toBase58();

    const nonceRes = await fetch("/api/auth/nonce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    const { message } = await nonceRes.json();
    if (!message) throw new Error("could not start login");

    if (typeof provider.signMessage !== "function") {
      throw new Error("this wallet cannot sign messages");
    }
    const signed = await withWalletTimeout(
      provider.signMessage(new TextEncoder().encode(message), "utf8"),
      60_000,
      "signature",
    );
    const verify = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet, signature: bs58.encode(signed.signature) }),
    });
    if (!verify.ok) throw new Error("signature rejected");

    useAuth.setState({ wallet });
    await refreshServerState();
    return wallet;
  } finally {
    useAuth.setState({ connecting: false });
  }
}

export async function disconnectWallet() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  useAuth.setState({ wallet: null });
  useGame.getState().leaveServerMode();
}

/** seat (or re-seat) through the server — txSig only for live on-chain entries */
export async function serverEnter(
  method: "usdc" | "gf" | "free",
  txSig?: string,
): Promise<{ ok: boolean; error?: string; payment?: string }> {
  const res = await fetch("/api/game/enter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, txSig }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: j.error ?? "enter failed" };
  if (j.state) useGame.getState().hydrateServer(j.state);
  return { ok: true, payment: j.payment };
}

/** mounts once (TopBar): restores the session and keeps the mirror fresh */
export function useServerSync() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let stop = false;

    (async () => {
      try {
        const me = await fetch("/api/auth/me").then((r) => r.json());
        if (stop || !me?.wallet) return;
        useAuth.setState({ wallet: me.wallet });
        await refreshServerState();
      } catch {
        /* guest mode */
      }
    })();

    const iv = setInterval(() => {
      if (useAuth.getState().wallet) refreshServerState().catch(() => {});
    }, 5_000);

    return () => {
      stop = true;
      clearInterval(iv);
      started.current = false;
    };
  }, []);
}
