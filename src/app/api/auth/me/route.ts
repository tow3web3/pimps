import { NextResponse } from "next/server";
import { accountLabel, payoutWalletOf, sessionWallet } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const wallet = await sessionWallet();
  const label = wallet ? await accountLabel(wallet) : null;
  const payoutWallet = wallet?.startsWith("em:") ? await payoutWalletOf(wallet) : null;
  return NextResponse.json({ wallet, label, payoutWallet });
}
