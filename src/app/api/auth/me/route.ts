import { NextResponse } from "next/server";
import { accountLabel, sessionWallet } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const wallet = await sessionWallet();
  const label = wallet ? await accountLabel(wallet) : null;
  return NextResponse.json({ wallet, label });
}
