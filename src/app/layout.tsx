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
  title: `${BRAND} — memecoin prop firm`,
  description: `${TAGLINE} — pass 3 challenges on live pump.fun prices with a simulated 10 SOL stack and win a $300 cash prize.`,
  openGraph: {
    title: `${BRAND} — trade memecoins. get funded.`,
    description: `Clear 3 challenges on a 10 SOL demo stack against live pump.fun markets and win a $300 cash prize.`,
    type: "website",
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
      <body className="min-h-full flex flex-col">
        <div className="bg-scene" aria-hidden />
        <div className="scanlines" aria-hidden />
        {children}
      </body>
    </html>
  );
}
