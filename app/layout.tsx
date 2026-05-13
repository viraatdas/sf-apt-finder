import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Apt Tinder — SF",
  description: "Swipe through 3BR SF apartments under $9k",
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
