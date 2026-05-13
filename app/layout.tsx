import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = process.env.SITE_URL ?? "https://apt-tinder.viraat.dev";

export const metadata: Metadata = {
  title: {
    default: "apt·tinder — swipe SF apartments",
    template: "%s · apt·tinder",
  },
  description:
    "Daily swipe-through of every 3BR San Francisco rental under $9k. Deduped across Zillow, Craigslist, Apartments.com, Trulia, Padmapper, and HotPads.",
  metadataBase: new URL(SITE_URL),
  applicationName: "apt-tinder",
  keywords: [
    "San Francisco apartments",
    "SF rentals",
    "3 bedroom",
    "Zillow",
    "Craigslist",
    "apartment swipe",
  ],
  openGraph: {
    title: "apt·tinder — swipe SF apartments",
    description: "Every new 3BR SF rental under $9k, deduped daily from 5+ sources.",
    url: SITE_URL,
    siteName: "apt·tinder",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "apt·tinder",
    description: "Swipe through every new SF 3BR rental, daily.",
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  themeColor: "#ec4899",
  colorScheme: "light" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-ink-100 bg-white/70 backdrop-blur sticky top-0 z-50">
          <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
            <Link href="/" className="font-display text-xl tracking-tight">
              apt<span className="text-accent-yes">·</span>tinder
            </Link>
            <nav className="flex gap-1 text-sm">
              <Link href="/" className="px-3 py-1.5 rounded-full hover:bg-ink-100">
                Swipe
              </Link>
              <Link href="/map" className="px-3 py-1.5 rounded-full hover:bg-ink-100">
                Map
              </Link>
              <Link href="/liked" className="px-3 py-1.5 rounded-full hover:bg-ink-100">
                Shortlist
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
