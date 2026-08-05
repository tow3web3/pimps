import { NextRequest, NextResponse } from "next/server";
import { getPrices } from "@/server/priceHub";

export const dynamic = "force-dynamic";

// This route costs ZERO upstream calls: the price hub keeps one shared loop
// running for the whole site and every client reads from it.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("pairs") ?? "";
  const pairs = raw
    .split(",")
    .filter((p) => /^[A-Za-z0-9]{30,50}$/.test(p))
    .slice(0, 30);
  if (pairs.length === 0) return NextResponse.json({ tokens: [], solUsd: 0 });
  return NextResponse.json(getPrices(pairs));
}
