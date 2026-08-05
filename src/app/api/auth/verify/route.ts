import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifyAndCreateSession } from "@/server/auth";
import { clientKey, rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = rateLimit(`verify:${clientKey(req)}`, 20, 60_000);
  if (limited) return limited;
  const { wallet, signature } = await req.json().catch(() => ({}));
  if (typeof wallet !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const token = verifyAndCreateSession(wallet, signature);
  if (!token) return NextResponse.json({ error: "signature rejected" }, { status: 401 });

  const res = NextResponse.json({ wallet });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // tunnel terminates TLS; cookie must work on localhost too
    maxAge: 30 * 24 * 3600,
    path: "/",
  });
  return res;
}
