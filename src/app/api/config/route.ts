import { NextResponse } from "next/server";
import { getConfig } from "@/server/config";

export const dynamic = "force-dynamic";

// Public runtime config, read fresh on every request so a launch-day change
// reaches every open browser within seconds. No secrets are exposed here:
// the treasury address is public by nature, the mint is public by nature.
export async function GET() {
  const c = getConfig();
  return NextResponse.json({
    treasuryWallet: c.treasuryWallet,
    gfMint: c.gfMint,
    gfDecimals: c.gfDecimals,
    paymentsLive: c.treasuryWallet.length >= 32,
    gfLive: c.gfMint.length >= 32 && c.treasuryWallet.length >= 32,
  });
}
