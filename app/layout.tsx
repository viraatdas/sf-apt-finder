import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CityNav } from "@/components/city-nav";

const SITE_URL = process.env.SITE_URL ?? "https://apt-tinder.viraat.dev";

export const metadata: Metadata = {
  title: {
    default: "apt·tinder — swipe apartments",
    template: "%s · apt·tinder",
  },
  description:
    "Daily swipe-through of apartment rentals from Craigslist, Kijiji, PadMapper, Zumper, liv.rent, rentals.ca, and Facebook Marketplace.",
  metadataBase: new URL(SITE_URL),
  applicationName: "apt-tinder",
  keywords: [
    "apartments",
    "rentals",
    "Craigslist",
    "Kijiji",
    "PadMapper",
    "Zumper",
    "liv.rent",
    "rentals.ca",
    "Facebook Marketplace",
    "Vancouver rentals",
    "San Francisco rentals",
    "apartment swipe",
  ],
  openGraph: {
    title: "apt·tinder — swipe apartments",
    description:
      "Daily rental listings from Craigslist, Kijiji, PadMapper, Zumper, liv.rent, rentals.ca, and Facebook Marketplace.",
    url: SITE_URL,
    siteName: "apt·tinder",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "apt·tinder",
    description: "Swipe through rentals from Craigslist, Kijiji, PadMapper, Zumper, liv.rent, rentals.ca, and Facebook Marketplace.",
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
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 min-h-14 py-2 flex flex-wrap gap-3 items-center justify-between">
            <Link href="/" className="font-display text-xl tracking-tight">
              apt<span className="text-accent-yes">·</span>tinder
            </Link>
            <Suspense fallback={<div className="h-9 w-72 rounded-full bg-ink-100 animate-pulse" />}>
              <CityNav />
            </Suspense>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-ink-100 mt-12 py-6 text-center text-sm text-ink-900/60">
          <p>
            Like what you see? Want to collab on a place?{" "}
            <a
              href="mailto:viraat@exla.ai?subject=apt-tinder"
              className="text-accent-yes font-medium hover:underline"
            >
              viraat@exla.ai
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
