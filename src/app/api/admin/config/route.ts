import { NextRequest, NextResponse } from "next/server";
import { fetchMintDecimals, getConfig, gfPriceUsd, setConfig } from "@/server/config";
import { clientKey, rateLimit } from "@/server/rateLimit";

export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function authorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 12) return false; // refuse to run unprotected
  return req.headers.get("x-admin-secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const c = getConfig();
  const price = c.gfMint ? await gfPriceUsd(c.gfMint) : null;
  return NextResponse.json({ ...c, gfPriceUsd: price });
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(`admin:${clientKey(req)}`, 10, 60_000);
  if (limited) return limited;
  if (!authorized(req)) {
    return NextResponse.json(
      { error: "unauthorized — set ADMIN_SECRET (12+ chars) and send x-admin-secret" },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, string | number> = {};

  if (typeof body.treasuryWallet === "string" && body.treasuryWallet.trim()) {
    const w = body.treasuryWallet.trim();
    if (!BASE58.test(w)) return NextResponse.json({ error: "invalid treasury address" }, { status: 400 });
    patch.treasuryWallet = w;
  }

  let priceCheck: number | null = null;
  if (typeof body.gfMint === "string" && body.gfMint.trim()) {
    const m = body.gfMint.trim();
    if (!BASE58.test(m)) return NextResponse.json({ error: "invalid mint address" }, { status: 400 });
    // read decimals from the chain rather than assuming — a wrong value here
    // would misprice every entry by orders of magnitude
    const dec = await fetchMintDecimals(m);
    if (dec === null) {
      return NextResponse.json(
        { error: "mint not found on-chain — check the address, or retry in a few seconds" },
        { status: 400 },
      );
    }
    priceCheck = await gfPriceUsd(m);
    patch.gfMint = m;
    patch.gfDecimals = dec;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  setConfig(patch);

  return NextResponse.json({
    ok: true,
    config: getConfig(),
    gfPriceUsd: priceCheck,
    note:
      priceCheck === null && patch.gfMint
        ? "mint accepted, but no market found yet — the $GF lane opens as soon as a pool is indexed"
        : "live immediately, no restart needed",
  });
}
