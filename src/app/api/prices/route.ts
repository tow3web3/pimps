import { NextRequest, NextResponse } from "next/server";
import { getPrices } from "@/server/priceHub";

export const dynamic = "force-dynamic";

// Costs zero upstream calls for most requests: the price hub coordinates one
// shared refresh across every serverless instance through a Postgres lock.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("pairs") ?? "";
  const pairs = raw
    .split(",")
    .filter((p) => /^[A-Za-z0-9]{30,50}$/.test(p))
    .slice(0, 30);
  if (pairs.length === 0) return NextResponse.json({ tokens: [], solUsd: 0 });
  try {
    return NextResponse.json(await getPrices(pairs));
  } catch {
    return NextResponse.json({ tokens: [], solUsd: 0, source: "dexscreener" });
  }
}
