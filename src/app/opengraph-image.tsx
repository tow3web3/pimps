import { ImageResponse } from "next/og";
import { BRAND, fundedAccountUsd, RULES } from "@/lib/rules";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${BRAND} — trade memecoins, get funded`;

// satori needs raw font bytes — resolve them through Google's css2 endpoint,
// which serves a TTF url when asked without a modern UA
async function loadGoogleFont(family: string, weight: number, italic = false): Promise<ArrayBuffer | null> {
  try {
    const fam = family.replace(/ /g, "+");
    const spec = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${fam}:${spec}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Satori)" },
    }).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

// The link preview for Twitter/Discord: the paper poster in one glance.
export default async function OG() {
  const prize = `$${fundedAccountUsd()}`;
  const pitch = `${RULES.startBalance} SOL demo stack on live pump.fun markets. Clear ${RULES.phases.length} challenges — ${RULES.phases.map((p) => p.gainLabel).join(", ")} — and the firm sends ${prize} straight to your wallet.`;
  // plain glyphs only: the embedded fonts don't cover ✦ and satori has no fallback
  const band = `pass 3 challenges  ·  ${prize} cash prize  ·  live pump.fun prices  ·  $${RULES.token.symbol} entries are burned`;

  const [bricolage, serif] = await Promise.all([
    loadGoogleFont("Bricolage Grotesque", 800),
    loadGoogleFont("Instrument Serif", 400, true),
  ]);
  const fonts = [
    ...(bricolage ? [{ name: "Bricolage", data: bricolage, weight: 800 as const }] : []),
    ...(serif ? [{ name: "InstrumentSerif", data: serif, weight: 400 as const, style: "italic" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f2efe6",
          color: "#131110",
          fontFamily: bricolage ? "Bricolage" : "sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            margin: 26,
            marginBottom: 0,
            border: "4px solid #131110",
            borderBottom: "none",
            borderRadius: "10px 10px 0 0",
            padding: "40px 56px 0 56px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  background: "#ff5200",
                  border: "3px solid #131110",
                  transform: "rotate(45deg)",
                }}
              />
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>{BRAND}</div>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 800,
                background: "#ff5200",
                color: "#131110",
                border: "3px solid #131110",
                borderRadius: 999,
                padding: "10px 26px",
                transform: "rotate(-4deg)",
                boxShadow: "4px 4px 0 #131110",
              }}
            >
              {`free roll — win $${RULES.freeRewardUsd}`}
            </div>
          </div>

          <div
            style={{
              fontSize: 95,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: -3,
              marginTop: 48,
              display: "flex",
            }}
          >
            Trade memecoins.
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
            <div
              style={{
                fontSize: 95,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: -3,
                display: "flex",
              }}
            >
              Get
            </div>
            <div
              style={{
                fontSize: 100,
                lineHeight: 1.05,
                color: "#ff5200",
                fontFamily: serif ? "InstrumentSerif" : "serif",
                fontStyle: "italic",
                display: "flex",
                borderBottom: "6px solid #ff5200",
              }}
            >
              funded.
            </div>
          </div>

          <div
            style={{
              fontSize: 25,
              color: "#575349",
              marginTop: 34,
              lineHeight: 1.45,
              maxWidth: 980,
              display: "flex",
            }}
          >
            {pitch}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#131110",
            color: "#f2efe6",
            margin: 26,
            marginTop: 0,
            border: "4px solid #131110",
            borderRadius: "0 0 10px 10px",
            padding: "18px 0",
            fontSize: 24,
          }}
        >
          {band}
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
