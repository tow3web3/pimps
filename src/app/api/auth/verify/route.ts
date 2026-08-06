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
  const token = await verifyAndCreateSession(wallet, signature);
  if (!token) return NextResponse.json({ error: "signature rejected" }, { status: 401 });

  // The session cookie MUST be Secure on an HTTPS origin — Safari/iOS (and
  // Phantom's in-app browser) silently drop a non-Secure cookie over HTTPS,
  // which made the sign-in "succeed" but never persist. Detect the real scheme
  // from the proxy header (Vercel + the Cloudflare tunnel both set it) and only
  // fall back to non-Secure on plain-http localhost.
  const proto =
    req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const isHttps = proto === "https";

  const res = NextResponse.json({ wallet });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    maxAge: 30 * 24 * 3600,
    path: "/",
  });
  return res;
}
