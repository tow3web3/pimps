import { NextRequest, NextResponse } from "next/server";
import { emailSession, SESSION_COOKIE } from "@/server/auth";
import { clientKey, rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

// Register-or-login with email + password — the lane that needs no wallet.
// A wallet is only required later, to RECEIVE a prize.
export async function POST(req: NextRequest) {
  const limited = rateLimit(`email:${clientKey(req)}`, 10, 60_000);
  if (limited) return limited;

  const { email, password } = await req.json().catch(() => ({}));
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
    email.length > 254
  ) {
    return NextResponse.json({ error: "enter a valid email" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const r = await emailSession(email.toLowerCase().trim(), password);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 401 });

  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const res = NextResponse.json({ wallet: r.acct, label: email.toLowerCase().trim() });
  res.cookies.set(SESSION_COOKIE, r.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    maxAge: 30 * 24 * 3600,
    path: "/",
  });
  return res;
}
