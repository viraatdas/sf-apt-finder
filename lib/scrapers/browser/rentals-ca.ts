import type { Page } from "playwright";
import type { RawListing, ScrapeContext } from "../types";
import type { BrowserScraper } from "./index";

export const rentalsCa: BrowserScraper = {
  source: "rentals-ca",
  async scrape(ctx: ScrapeContext, page: Page): Promise<RawListing[]> {
    if (ctx.city !== "vancouver") return [];
    await page.goto("https://rentals.ca/vancouver", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(8000);
    const title = await page.title().catch(() => "");
    if (/just a moment/i.test(title)) return [];

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 1600));
      await page.waitForTimeout(800);
    }

    const items = await page.evaluate((maxPrice) => {
      const anchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href*="/vancouver"]')
      );
      const seen = new Set<string>();
      const out: any[] = [];

      for (const anchor of anchors) {
        const href = anchor.href;
        if (!href || seen.has(href)) continue;
        const root =
          anchor.closest("article") ??
          anchor.closest('[data-testid*="listing"]') ??
          anchor.closest("li") ??
          anchor.parentElement;
        const text = (root?.textContent ?? anchor.textContent ?? "").replace(/\s+/g, " ").trim();
        const priceM = text.match(/\$\s*([\d,]+)/);
        if (!priceM) continue;
        const price = parseInt(priceM[1].replace(/,/g, ""), 10);
        if (!Number.isFinite(price) || price > maxPrice) continue;
        const bedM = text.match(/(\d+(?:\.\d+)?)\s*(?:bed|bd|br)/i);
        const bathM = text.match(/(\d+(?:\.\d+)?)\s*(?:bath|ba)/i);
        const sqftM = text.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft|ft2)/i);
        const img = root?.querySelector<HTMLImageElement>("img");
        const anchorTitle =
          anchor.getAttribute("aria-label") ||
          anchor.textContent?.trim();
        const textTitle = text.split("$")[0]?.trim();
        const slugTitle = href
          .split("/")
          .filter(Boolean)
          .pop()
          ?.replace(/-/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());
        const title =
          anchorTitle && !/^details$/i.test(anchorTitle)
            ? anchorTitle
            : textTitle && !/^details$/i.test(textTitle)
              ? textTitle
              : slugTitle || "Rentals.ca listing";

        out.push({
          href,
          title,
          text,
          price,
          bedrooms: bedM ? parseFloat(bedM[1]) : undefined,
          bathrooms: bathM ? parseFloat(bathM[1]) : undefined,
          sqft: sqftM ? parseInt(sqftM[1].replace(/,/g, ""), 10) : undefined,
          photoUrls: img?.currentSrc || img?.src ? [img.currentSrc || img.src] : [],
        });
        seen.add(href);
      }

      return out.slice(0, 80);
    }, ctx.maxPrice);

    const now = new Date().toISOString();
    return items.map((item: any): RawListing => ({
      source: "rentals-ca",
      sourceId: String(item.href).split("/").filter(Boolean).pop() ?? String(item.href),
      url: item.href,
      title: String(item.title).slice(0, 200),
      price: item.price,
      bedrooms: item.bedrooms,
      bathrooms: item.bathrooms,
      sqft: item.sqft,
      photoUrls: item.photoUrls ?? [],
      scrapedAt: now,
      raw: item,
    }));
  },
};
