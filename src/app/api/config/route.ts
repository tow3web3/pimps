import { NextResponse } from "next/server";
import { getConfig, gfMarketLive } from "@/server/config";

export const dynamic = "force-dynamic";

// Public runtime config, read fresh on every request so a launch-day change
// reaches every open browser within seconds. No secrets: the treasury address
// and the mint are public by nature.
export async function GET() {
  const c = await getConfig();
  // the CA stays PRIVATE until the token actually trades — no pre-launch
  // sniping off our own config endpoint
  const marketLive = await gfMarketLive(c.gfMint);
  return NextResponse.json({
    treasuryWallet: c.treasuryWallet,
    gfMint: marketLive ? c.gfMint : "",
    gfDecimals: c.gfDecimals,
    paymentsLive: c.treasuryWallet.length >= 32,
    gfLive: marketLive && c.treasuryWallet.length >= 32,
  });
}
