import type { Page } from "playwright";
import type { RawListing, ScrapeContext } from "../types";
import type { BrowserScraper } from "./index";

/**
 * HotPads — tiles have a [data-renderstrat] root with /pad URLs.
 * Probe found 57+ tiles on a single page, no pagination needed for SF 3BR.
 */
export const hotpads: BrowserScraper = {
  source: "hotpads",
  async scrape(ctx: ScrapeContext, page: Page): Promise<RawListing[]> {
    const url = `https://hotpads.com/san-francisco-ca/apartments-for-rent?beds=${ctx.bedrooms}-&maxRent=${ctx.maxPrice}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 1800));
      await page.waitForTimeout(700);
    }

    const items = await page.evaluate((maxPrice) => {
      const tiles = Array.from(
        document.querySelectorAll<HTMLElement>("[data-renderstrat]")
      );
      const seen = new Set<string>();
      const out: any[] = [];
      for (const tile of tiles) {
        const a = tile.querySelector<HTMLAnchorElement>('a[href*="/pad"], a[href*="/sm"], a[href*="hotpads.com/"]');
        const href = a?.getAttribute("href");
        if (!href) continue;
        const fullUrl = href.startsWith("http") ? href : `https://hotpads.com${href}`;
        if (seen.has(fullUrl)) continue;
        seen.add(fullUrl);

        const text = tile.innerText ?? "";
        const priceM = text.match(/\$\s*([\d,]+)(?:\s*[-–]\s*\$\s*([\d,]+))?/);
        if (!priceM) continue;
        const priceA = parseInt(priceM[1].replace(/,/g, ""), 10);
        const priceB = priceM[2] ? parseInt(priceM[2].replace(/,/g, ""), 10) : priceA;
        const price = Math.min(priceA, priceB);
        if (!Number.isFinite(price) || price > maxPrice) continue;

        const bedM = text.match(/(\d+)\s*(?:bd|bed|br)/i);
        const baM = text.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath)/i);
        const sqftM = text.match(/([\d,]+)\s*(?:sqft|sq\s*ft)/i);
        const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
        // Building name: usually after "$X | beds | units available"
        const name = lines.find((l) => l.length > 4 && !/^\$|^\d+\s*(bed|ba)|^Favorite|^Previous|^Next|^Contact|^Apt\b/i.test(l));
        const addr = lines.find((l) => /\b(st|ave|blvd|rd|dr|ct|pl|way|ter)\b/i.test(l) && /\d/.test(l));
        const img = tile.querySelector("img")?.getAttribute("src") ?? null;
        out.push({
          href: fullUrl,
          sourceId: href.replace(/^\//, "").split("/")[0],
          title: (name ?? lines[0] ?? "HotPads listing").slice(0, 200),
          price,
          bedrooms: bedM ? parseInt(bedM[1], 10) : undefined,
          bathrooms: baM ? parseFloat(baM[1]) : undefined,
          sqft: sqftM ? parseInt(sqftM[1].replace(/,/g, ""), 10) : undefined,
          addressLine: addr,
          img: img && img.startsWith("http") ? img : null,
        });
      }
      return out;
    }, ctx.maxPrice);

    const now = new Date().toISOString();
    return items.map((it: any) => ({
      source: "hotpads",
      sourceId: String(it.sourceId),
      url: it.href,
      title: it.title,
      price: it.price,
      bedrooms: it.bedrooms,
      bathrooms: it.bathrooms,
      sqft: it.sqft,
      addressLine: it.addressLine,
      photoUrls: it.img ? [it.img] : [],
      scrapedAt: now,
    }));
  },
};
