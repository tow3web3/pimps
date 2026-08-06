"use client";

// ONE door for every identity: Privy's modal offers email (mints an embedded
// Solana wallet on the spot) AND external wallets (Phantom, Solflare,
// Backpack… via wallet-standard). Whichever the user picks, the resulting
// wallet signs OUR normal login message — the server keeps a single identity
// model (a Solana address) and payouts go to the wallet the account owns.

import { useEffect, useRef, useState, type ReactNode } from "react";
import bs58 from "bs58";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import {
  toSolanaWalletConnectors,
  useCreateWallet,
  useSignMessage,
  useWallets,
} from "@privy-io/react-auth/solana";
import { refreshServerState, useAuth } from "@/lib/authClient";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export function privyEnabled(): boolean {
  return APP_ID.length > 0;
}

function Inner({
  onDone,
  onError,
  className,
  children,
}: {
  onDone: () => void;
  onError: (msg: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { createWallet } = useCreateWallet();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const wallet = wallets[0];

  // email path completed but no wallet yet → mint the embedded one
  useEffect(() => {
    if (!busy || !authenticated || !ready || wallets.length > 0) return;
    createWallet().catch(() => {
      /* either it already exists, or the flow below never fires and the
         user can simply retry */
    });
  }, [busy, authenticated, ready, wallets.length, createWallet]);

  // wallet present (embedded or external) → run our nonce/sign/verify flow
  useEffect(() => {
    if (!busy || !authenticated || !wallet || running.current) return;
    running.current = true;
    (async () => {
      try {
        const address = wallet.address;
        const nonceRes = await fetch("/api/auth/nonce", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet: address }),
        });
        const { message } = await nonceRes.json();
        if (!message) throw new Error("could not start login");
        const { signature } = await signMessage({
          message: new TextEncoder().encode(message),
          wallet,
        });
        const verify = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet: address, signature: bs58.encode(signature) }),
        });
        if (!verify.ok) throw new Error("signature rejected");
        useAuth.setState({
          wallet: address,
          label: user?.email?.address ?? null,
        });
        await refreshServerState();
        onDone();
      } catch (e) {
        onError(e instanceof Error ? e.message : "sign-in failed");
      } finally {
        running.current = false;
        setBusy(false);
      }
    })();
  }, [busy, authenticated, wallet, signMessage, user, onDone, onError]);

  const start = () => {
    if (busy) return;
    setBusy(true);
    if (!authenticated) {
      try {
        login();
      } catch {
        setBusy(false);
        onError("could not open the login window");
      }
    }
    // already authenticated → the effects above take it from here
  };

  return (
    <button onClick={start} disabled={!ready || busy} className={className}>
      {busy ? "signing you in…" : children}
    </button>
  );
}

export default function PrivyConnect(props: {
  onDone: () => void;
  onError: (msg: string) => void;
  className?: string;
  children: ReactNode;
}) {
  if (!APP_ID) return null;
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: {
          theme: "light",
          accentColor: "#ff5200",
          walletChainType: "solana-only",
        },
        embeddedWallets: {
          showWalletUIs: false,
          solana: { createOnLogin: "users-without-wallets" },
        },
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors() },
        },
      }}
    >
      <Inner {...props} />
    </PrivyProvider>
  );
}
