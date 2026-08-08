import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Rich per-token profile — the "who made this and where does it live" panel a
// real trading terminal shows. Merges pump.fun's coin record (creator, age,
// all-time-high, socials) with DexScreener's link + banner data. Cached per
// mint so opening a token repeatedly costs one upstream pair, not many.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const WSOL = "So11111111111111111111111111111111111111112";

interface Social {
  type: string;
  url: string;
}

const cache = new Map<string, { at: number; body: unknown }>();

function normalizeSocials(
  pf: { twitter?: string; telegram?: string; website?: string },
  ds: { socials?: Social[]; websites?: { url: string; label?: string }[] },
): { twitter?: string; telegram?: string; website?: string } {
  const out: { twitter?: string; telegram?: string; website?: string } = {};
  if (pf.twitter) out.twitter = pf.twitter;
  if (pf.telegram) out.telegram = pf.telegram;
  if (pf.website) out.website = pf.website;
  for (const s of ds.socials ?? []) {
    const t = s.type?.toLowerCase();
    if (t === "twitter" && !out.twitter) out.twitter = s.url;
    if (t === "telegram" && !out.telegram) out.telegram = s.url;
  }
  if (!out.website && ds.websites?.[0]?.url) out.website = ds.websites[0].url;
  return out;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ mint: string }> }) {
  const { mint } = await ctx.params;
  if (!/^[A-Za-z0-9]{32,44}$/.test(mint)) {
    return NextResponse.json({ error: "invalid mint" }, { status: 400 });
  }

  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < 60_000) return NextResponse.json(hit.body);

  const [pfRes, dsRes] = await Promise.allSettled([
    fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      cache: "no-store",
      headers: { accept: "application/json", "user-agent": UA },
    }),
    fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    }),
  ]);

  const pf =
    pfRes.status === "fulfilled" && pfRes.value.ok ? await pfRes.value.json() : {};
  const dsPairs =
    dsRes.status === "fulfilled" && dsRes.value.ok ? await dsRes.value.json() : [];
  const dsPair = Array.isArray(dsPairs)
    ? dsPairs
        .filter((p) => p.quoteToken?.address === WSOL)
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
    : null;

  const body = {
    mint,
    symbol: pf.symbol ?? dsPair?.baseToken?.symbol ?? "?",
    name: pf.name ?? dsPair?.baseToken?.name ?? "?",
    description: pf.description ?? null,
    imageUrl: pf.image_uri ?? dsPair?.info?.imageUrl ?? null,
    bannerUrl: dsPair?.info?.header ?? null,
    creator: pf.creator ?? null,
    createdAt: pf.created_timestamp ?? dsPair?.pairCreatedAt ?? null,
    athMcapUsd: pf.ath_market_cap ?? null,
    mcapUsd: pf.usd_market_cap ?? dsPair?.marketCap ?? dsPair?.fdv ?? null,
    liqUsd: dsPair?.liquidity?.usd ?? null,
    vol24Usd: dsPair?.volume?.h24 ?? null,
    totalSupply: pf.total_supply ? Number(pf.total_supply) / 1e6 : null,
    replyCount: pf.reply_count ?? null,
    pairAddress: pf.pump_swap_pool ?? dsPair?.pairAddress ?? null,
    // the pair DEXSCREENER charts — their embed only renders their own pairs,
    // so this (not any pool we know from elsewhere) is what the iframe gets
    chartPair: dsPair?.pairAddress ?? null,
    socials: normalizeSocials(pf, dsPair?.info ?? {}),
    graduated: !!pf.complete,
  };

  // a missing chartPair usually means the DS lookup hiccuped — retry soon
  // instead of pinning a blank chart for a full minute
  const ttl = body.chartPair ? 60_000 : 5_000;
  cache.set(mint, { at: Date.now() - (60_000 - ttl), body });
  if (cache.size > 300) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return NextResponse.json(body);
}
