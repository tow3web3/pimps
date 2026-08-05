import { NextRequest, NextResponse } from "next/server";
import { getConfig, gfPriceUsd } from "@/server/config";
import { entryFeeGfUsd } from "@/lib/rules";

export const dynamic = "force-dynamic";

// How many $GF an entry costs right now. Quoted from the deepest pool, cached
// briefly so a launch-day crowd doesn't hammer the price source.
let cache: { at: number; price: number } | null = null;

export async function GET(req: NextRequest) {
  const cfg = getConfig();
  if (!cfg.gfMint) return NextResponse.json({ error: "token not launched yet" }, { status: 400 });

  let price = cache && Date.now() - cache.at < 5_000 ? cache.price : null;
  if (price === null) {
    price = await gfPriceUsd(cfg.gfMint);
    if (price === null || price <= 0) {
      return NextResponse.json(
        { error: "no $GF market indexed yet — pay in usdc for now" },
        { status: 400 },
      );
    }
    cache = { at: Date.now(), price };
  }

  const usd = Number(req.nextUrl.searchParams.get("usd") ?? entryFeeGfUsd());
  const amountUsd = isFinite(usd) && usd > 0 ? usd : entryFeeGfUsd();
  return NextResponse.json({ priceUsd: price, usd: amountUsd, tokens: amountUsd / price });
}
