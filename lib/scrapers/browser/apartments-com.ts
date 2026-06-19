import type { Page } from "playwright";
import type { RawListing, ScrapeContext } from "../types";
import type { BrowserScraper } from "./index";

/**
 * Apartments.com render-then-scrape. Each listing card is an <article>
 * with data-listingid + structured price/address text inside.
 */
export const apartmentsCom: BrowserScraper = {
  source: "apartments-com",
  async scrape(ctx: ScrapeContext, page: Page): Promise<RawListing[]> {
    if (ctx.city !== "san-francisco" || ctx.bedrooms == null) return [];
    const url = `https://www.apartments.com/san-francisco-ca/${ctx.bedrooms}-bedrooms-under-${ctx.maxPrice}/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);

    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 1600));
      await page.waitForTimeout(700);
    }

    const items = await page.evaluate((maxPrice) => {
      const articles = Array.from(
        document.querySelectorAll<HTMLElement>(
          "article[data-listingid], article.placard, article[class*='placard']"
        )
      );
      const out: any[] = [];
      for (const art of articles) {
        const a = art.querySelector("a[href*='/sanfrancisco-ca/'], a[href*='apartments.com/']") as HTMLAnchorElement | null;
        const href = a?.href;
        if (!href) continue;

        const text = art.innerText ?? "";
        const priceM = text.match(/\$\s*([\d,]+)(?:\s*[-\u2013]\s*\$\s*([\d,]+))?/);
        if (!priceM) continue;
        const priceA = parseInt(priceM[1].replace(/,/g, ""), 10);
        const priceB = priceM[2] ? parseInt(priceM[2].replace(/,/g, ""), 10) : priceA;
        const price = Math.min(priceA, priceB);
        if (!Number.isFinite(price) || price > maxPrice) continue;

        const titleEl = art.querySelector(".property-title, .property-information [class*='title'], [class*='property-title']");
        const addrEl = art.querySelector(".property-address, [class*='property-address']");
        const bedM = text.match(/(\d+)\s*(?:bd|bed|br)/i);
        const baM = text.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath)/i);
        const sqftM = text.match(/([\d,]+)\s*(?:sqft|sq\s*ft)/i);

        const img = art.querySelector("img")?.getAttribute("src");
        const sourceId = art.getAttribute("data-listingid") ?? href.split("/").filter(Boolean).pop() ?? href;

        out.push({
          sourceId,
          href,
          title: (titleEl?.textContent ?? "Apartments.com listing").trim().slice(0, 200),
          price,
          addressLine: addrEl?.textContent?.trim(),
          bedrooms: bedM ? parseInt(bedM[1], 10) : undefined,
          bathrooms: baM ? parseFloat(baM[1]) : undefined,
          sqft: sqftM ? parseInt(sqftM[1].replace(/,/g, ""), 10) : undefined,
          img: img && img.startsWith("http") ? img : null,
        });
      }
      return out;
    }, ctx.maxPrice);

    const now = new Date().toISOString();
    return items.map((it: any) => ({
      source: "apartments-com",
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
