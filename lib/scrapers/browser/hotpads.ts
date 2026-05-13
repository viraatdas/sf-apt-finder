import type { Page } from "playwright";
import type { RawListing, ScrapeContext } from "../types";
import type { BrowserScraper } from "./index";

/**
 * HotPads — least defended of the big rental sites. Listings render server-side.
 * Strategy: navigate, scroll, parse all listing cards from DOM.
 */
export const hotpads: BrowserScraper = {
  source: "hotpads",
  async scrape(ctx: ScrapeContext, page: Page): Promise<RawListing[]> {
    const url = `https://hotpads.com/san-francisco-ca/apartments-for-rent?beds=${ctx.bedrooms}-&maxRent=${ctx.maxPrice}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);

    // Scroll to load more cards
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1800));
      await page.waitForTimeout(800);
    }

    const items = await page.evaluate((maxPrice) => {
      const cards = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          'a[href*="/sanfrancisco/"], a[href*="hotpads.com/"][href*="building"], a[href*="hotpads.com/"][href*="listing"], [data-testid*="ListingCard"] a, [class*="ListingCard"] a'
        )
      );
      const seen = new Set<string>();
      const out: any[] = [];
      for (const a of cards) {
        const href = a.href;
        if (!href || seen.has(href)) continue;
        if (!/hotpads\.com\//.test(href)) continue;
        if (!/\/san[-_]?francisco|\/sanfrancisco/i.test(href)) continue;
        seen.add(href);
        const block = a.closest("article, li, [class*='Card'], [data-testid*='Card']") ?? a;
        const text = (block as HTMLElement).innerText ?? "";
        const priceMatch = text.match(/\$\s*([\d,]+)(?:\s*[-–]\s*\$\s*([\d,]+))?/);
        if (!priceMatch) continue;
        // Take the LOWEST price if a range
        const priceA = parseInt(priceMatch[1].replace(/,/g, ""), 10);
        const priceB = priceMatch[2] ? parseInt(priceMatch[2].replace(/,/g, ""), 10) : priceA;
        const price = Math.min(priceA, priceB);
        if (!Number.isFinite(price) || price > maxPrice) continue;
        const bedM = text.match(/(\d+)\s*(?:bd|bed|br)/i);
        const baM = text.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath)/i);
        const sqftM = text.match(/([\d,]+)\s*(?:sqft|sf)/i);
        // Address: take first line that looks address-y
        const lines = text.split(/\n/).map((s: string) => s.trim()).filter(Boolean);
        const addr = lines.find((l: string) => /\d.*(st|ave|blvd|rd|dr|ct|pl|way|ter)\b/i.test(l));
        const img = block.querySelector("img")?.getAttribute("src") ?? null;
        out.push({
          href,
          price,
          bedrooms: bedM ? parseInt(bedM[1], 10) : undefined,
          bathrooms: baM ? parseFloat(baM[1]) : undefined,
          sqft: sqftM ? parseInt(sqftM[1].replace(/,/g, ""), 10) : undefined,
          addressLine: addr,
          title: lines[0]?.slice(0, 200) ?? "HotPads listing",
          img,
        });
      }
      return out;
    }, ctx.maxPrice);

    const now = new Date().toISOString();
    const listings: RawListing[] = items.map((it: any) => ({
      source: "hotpads",
      sourceId: it.href.replace(/^https?:\/\//, "").slice(0, 100),
      url: it.href,
      title: it.title,
      price: it.price,
      bedrooms: it.bedrooms,
      bathrooms: it.bathrooms,
      sqft: it.sqft,
      addressLine: it.addressLine,
      photoUrls: it.img && it.img.startsWith("http") ? [it.img] : [],
      scrapedAt: now,
    }));
    return listings;
  },
};
