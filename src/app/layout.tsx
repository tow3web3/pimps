import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { BRAND, TAGLINE } from "@/lib/rules";
import "./globals.css";

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
});

const jbmono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${BRAND} — memecoin prop firm`,
  description: `${TAGLINE} — pass 3 challenges on live pump.fun prices with a simulated 10 SOL stack and unlock a funded account.`,
  openGraph: {
    title: `${BRAND} — trade memecoins. get funded.`,
    description: `Clear 3 challenges on a 10 SOL demo stack against live pump.fun markets and trade a funded account.`,
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#05060b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${grotesk.variable} ${jbmono.variable} h-full antialiased`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full flex flex-col">
        <div className="bg-scene" aria-hidden />
        <div className="scanlines" aria-hidden />
        {children}
      </body>
    </html>
  );
}
