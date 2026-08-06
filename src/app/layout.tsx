import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { BRAND, TAGLINE } from "@/lib/rules";
import "./globals.css";

// The type trio IS the brand: Bricolage for voice, Instrument for irony,
// JetBrains for numbers. Nothing here ships a default-looking font.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const serif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const jbmono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3333"),
  ),
  title: `${BRAND} — trade memecoins. get funded.`,
  description: `${TAGLINE} — the memecoin prop firm. Pass 3 challenges on live pump.fun prices with a 10 SOL demo stack and the firm sends $300 straight to your wallet. Free roll pays $50. Entries paid in $GETFUNDED are burned.`,
  openGraph: {
    title: `${BRAND} — trade memecoins. get funded.`,
    description: `Clear 3 challenges on a 10 SOL demo stack against live pump.fun markets — the firm sends $300 straight to your wallet. Free roll pays $50.`,
    type: "website",
    siteName: BRAND,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#f2efe6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${serif.variable} ${jbmono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: wallet/color-picker extensions stamp
          attributes on <body> before React hydrates — harmless, not ours */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <div className="bg-scene" aria-hidden />
        <div className="scanlines" aria-hidden />
        {children}
      </body>
    </html>
  );
}
