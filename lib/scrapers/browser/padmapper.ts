import type { Page } from "playwright";
import type { RawListing, ScrapeContext } from "../types";
import type { BrowserScraper } from "./index";

/**
 * Padmapper — listing tiles in a left-side panel. Render then scrape.
 */
export const padmapper: BrowserScraper = {
  source: "padmapper",
  async scrape(ctx: ScrapeContext, page: Page): Promise<RawListing[]> {
    const url = `https://www.padmapper.com/apartments/san-francisco-ca/${ctx.bedrooms}-bedrooms-under-${ctx.maxPrice}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    // Scroll the listings panel
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const list = document.querySelector("[class*='ListingPane'], [class*='listings'], [class*='Results']");
        (list ?? window).scrollBy?.(0, 1500);
        window.scrollBy(0, 800);
      });
      await page.waitForTimeout(700);
    }

    const items = await page.evaluate((maxPrice) => {
      // Padmapper listing links go to /apartment/<id>
      const links = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href*="/buildings/"], a[href*="/listing/"], a[href*="padmapper.com/apartment"]')
      );
      const seen = new Set<string>();
      const out: any[] = [];
      for (const a of links) {
        const href = a.href;
        if (!href || seen.has(href)) continue;
        seen.add(href);
        const card = a.closest("[class*='ListingItem'], [class*='listing-item'], li, article") as HTMLElement | null;
        const root = card ?? a;
        const text = (root.innerText ?? "").slice(0, 2000);
        const priceM = text.match(/\$\s*([\d,]+)(?:\s*[-–]\s*\$\s*([\d,]+))?/);
        if (!priceM) continue;
        const priceA = parseInt(priceM[1].replace(/,/g, ""), 10);
        const priceB = priceM[2] ? parseInt(priceM[2].replace(/,/g, ""), 10) : priceA;
        const price = Math.min(priceA, priceB);
        if (!Number.isFinite(price) || price > maxPrice) continue;
        const bedM = text.match(/(\d+)\s*(?:bd|bed|br)/i);
        const baM = text.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath)/i);
        const sqftM = text.match(/([\d,]+)\s*(?:sqft|sq\s*ft)/i);
        const lines = text.split(/\n/).map((s: string) => s.trim()).filter(Boolean);
        const addr = lines.find((l: string) => /\d.*(st|ave|blvd|rd|dr|ct|pl|way|ter)\b/i.test(l));
        const img = root.querySelector("img")?.getAttribute("src") ?? null;
        out.push({
          sourceId: href.split("/").filter(Boolean).pop() ?? href,
          href,
          title: lines[0]?.slice(0, 200) ?? "Padmapper listing",
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
      source: "padmapper",
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
