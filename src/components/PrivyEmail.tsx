"use client";

// Privy email login → embedded Solana wallet, created on the spot. The
// embedded wallet then signs OUR normal login message, so the server keeps
// exactly one identity model (a Solana address) and payouts need no special
// case: the prize goes to the wallet the user was born with here.

import { useEffect, useRef, useState, type ReactNode } from "react";
import bs58 from "bs58";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useSignMessage, useWallets } from "@privy-io/react-auth/solana";
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

  // after the Privy modal completes: make sure the embedded wallet exists
  useEffect(() => {
    if (!busy || !authenticated || !ready || wallets.length > 0) return;
    createWallet().catch(() => {
      /* either it already exists or the effect below never fires — surfaced
         by the timeout in start() */
    });
  }, [busy, authenticated, ready, wallets.length, createWallet]);

  // wallet present → run our own nonce/sign/verify session flow
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
    // if authenticated already, the effects above take it from here
  };

  return (
    <button onClick={start} disabled={!ready || busy} className={className}>
      {busy ? "signing you in…" : children}
    </button>
  );
}

export default function PrivyEmail(props: {
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
        loginMethods: ["email"],
        appearance: { theme: "light", accentColor: "#ff5200" },
        embeddedWallets: {
          showWalletUIs: false,
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <Inner {...props} />
    </PrivyProvider>
  );
}
