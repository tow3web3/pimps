import { ImageResponse } from "next/og";
import { BRAND, fundedAccountUsd, RULES } from "@/lib/rules";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${BRAND} — trade memecoins, get funded`;

// The link preview for Twitter/Discord: the pitch in one glance.
export default function OG() {
  // satori treats each interpolation as a child node: every text element must
  // receive exactly ONE pre-built string
  const pitch = `${RULES.startBalance} SOL demo stack on live pump.fun markets. Clear ${RULES.phases.length} challenges, win $${fundedAccountUsd()} sent to your Phantom.`;
  const chips = [
    RULES.phases.map((p) => p.gainLabel).join("  ·  "),
    `max ${RULES.maxExposure * 100}% / token`,
    `$${fundedAccountUsd()} prize`,
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 80px",
          background:
            "radial-gradient(900px 500px at 20% 0%, rgba(255,176,0,0.16), transparent 60%), radial-gradient(900px 600px at 90% 110%, rgba(255,213,138,0.18), transparent 60%), #05060b",
          color: "#e7ecf8",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 34 }}>
          <div
            style={{
              width: 18,
              height: 18,
              background: "#ffb000",
              transform: "rotate(45deg)",
            }}
          />
          <div style={{ fontSize: 26, letterSpacing: 10, color: "#97a3c0" }}>{BRAND}</div>
        </div>

        <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2 }}>
          TRADE MEMECOINS.
        </div>
        <div
          style={{
            fontSize: 84,
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: -2,
            color: "#ffb000",
          }}
        >
          GET FUNDED.
        </div>

        <div style={{ fontSize: 26, color: "#97a3c0", marginTop: 30, lineHeight: 1.45 }}>
          {pitch}
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 44 }}>
          {chips.map((t) => (
            <div
              key={t}
              style={{
                display: "flex",
                fontSize: 21,
                color: "#e7ecf8",
                border: "1px solid rgba(233,231,221,0.28)",
                borderRadius: 999,
                padding: "10px 22px",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
