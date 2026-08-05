import { NextRequest, NextResponse } from "next/server";
import { issueNonce, loginMessage } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { wallet } = await req.json().catch(() => ({}));
  if (typeof wallet !== "string" || wallet.length < 32 || wallet.length > 50) {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }
  const nonce = issueNonce(wallet);
  return NextResponse.json({ nonce, message: loginMessage(wallet, nonce) });
}
