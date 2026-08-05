import { NextResponse } from "next/server";

// In-process token buckets. One persistent Node process serves the whole site,
// so a plain Map is the right tool — no Redis, no per-request storage cost.

const buckets = new Map<string, { count: number; resetAt: number }>();
let lastSweep = 0;

/** returns a 429 response when the caller is over budget, otherwise null */
export function rateLimit(key: string, max: number, windowMs: number): NextResponse | null {
  const now = Date.now();

  // opportunistic cleanup so the map cannot grow without bound
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }

  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (b.count >= max) {
    const retry = Math.ceil((b.resetAt - now) / 1000);
    return NextResponse.json(
      { error: `too many requests — retry in ${retry}s` },
      { status: 429, headers: { "retry-after": String(retry) } },
    );
  }
  b.count++;
  return null;
}

/** best-effort client identity for unauthenticated routes */
export function clientKey(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    h.get("x-real-ip") ??
    "anon"
  );
}
