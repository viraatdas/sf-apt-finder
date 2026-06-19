import type { Page } from "playwright";
import type { RawListing, ScrapeContext } from "../types";
import type { BrowserScraper } from "./index";

/**
 * Trulia is DataDome-protected. Stealth Chromium + long warm-up usually slips through.
 * Listings have `data-testid="property-card-link"` or come from __NEXT_DATA__.
 */
export const trulia: BrowserScraper = {
  source: "trulia",
  async scrape(ctx: ScrapeContext, page: Page): Promise<RawListing[]> {
    if (ctx.city !== "san-francisco" || ctx.bedrooms == null) return [];
    const url = `https://www.trulia.com/for_rent/San_Francisco,CA/${ctx.bedrooms}p_beds/0-${ctx.maxPrice}_price/`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);

    // If still on the challenge page, give it one more beat
    if (/Press|access|denied/i.test(await page.title())) {
      await page.waitForTimeout(4000);
    }

    // Try __NEXT_DATA__ first (cleanest)
    const fromNext = await page.evaluate(() => {
      const el = document.querySelector('script#__NEXT_DATA__');
      if (!el) return null;
      try {
        const data = JSON.parse(el.textContent ?? "");
        const props = data?.props?.pageProps;
        const homes = props?.searchData?.homes ?? props?.searchResults?.homes ?? props?.homes;
        if (Array.isArray(homes)) return homes;
        // dig deeper
        const stack: any[] = [data];
        while (stack.length) {
          const n = stack.pop();
          if (n && typeof n === "object") {
            if (Array.isArray(n.homes)) return n.homes;
            for (const v of Object.values(n)) {
              if (v && typeof v === "object") stack.push(v);
            }
          }
        }
        return null;
      } catch {
        return null;
      }
    });

    const now = new Date().toISOString();
    if (fromNext && Array.isArray(fromNext) && fromNext.length) {
      console.log(`[trulia] using __NEXT_DATA__ (${fromNext.length} homes)`);
      const out: RawListing[] = [];
      for (const h of fromNext) {
        const price = Number(
          h?.price?.formattedPrice?.replace(/[^\d]/g, "") ??
          h?.rent ?? h?.price?.price ?? 0
        );
        if (!price || price > ctx.maxPrice) continue;
        const id = String(h?.legacyId ?? h?.uri ?? h?.url ?? h?.id ?? "");
        if (!id) continue;
        const urlPath = h?.uri ?? h?.url ?? h?.linkURL;
        out.push({
          source: "trulia",
          sourceId: id,
          url: urlPath?.startsWith("http") ? urlPath : `https://www.trulia.com${urlPath ?? ""}`,
          title: h?.location?.fullLocation ?? h?.address?.formattedAddress ?? h?.title ?? "Trulia listing",
          price,
          bedrooms: h?.bedrooms?.formattedValue
            ? parseInt(h.bedrooms.formattedValue, 10)
            : h?.beds,
          bathrooms: typeof h?.bathrooms?.formattedValue === "string"
            ? parseFloat(h.bathrooms.formattedValue)
            : h?.baths,
          sqft: h?.floorSpace?.formattedDimension
            ? parseInt(String(h.floorSpace.formattedDimension).replace(/[^\d]/g, ""), 10)
            : h?.sqft,
          addressLine: h?.address?.formattedAddress ?? h?.location?.fullLocation,
          zip: h?.address?.zipCode,
          lat: h?.location?.coordinates?.latitude ?? h?.latitude,
          lng: h?.location?.coordinates?.longitude ?? h?.longitude,
          photoUrls: Array.isArray(h?.photos)
            ? h.photos.map((p: any) => p?.url ?? p?.href).filter(Boolean).slice(0, 6)
            : h?.media?.heroImage?.url
              ? [h.media.heroImage.url]
              : [],
          scrapedAt: now,
          raw: h,
        });
      }
      return out;
    }

    // Fallback: parse DOM cards
    console.log(`[trulia] falling back to DOM scrape`);
    const items = await page.evaluate((maxPrice) => {
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid="property-card-link"], [data-testid*="home-card"], [data-testid*="propertyCard"], a[href*="/p/"]'
        )
      );
      const seen = new Set<string>();
      const out: any[] = [];
      for (const c of cards) {
        const a = (c.tagName === "A" ? c : c.querySelector("a")) as HTMLAnchorElement | null;
        const href = a?.href;
        if (!href || seen.has(href)) continue;
        seen.add(href);
        const root = c.closest("li, article, [data-testid*='card']") ?? c;
        const text = (root as HTMLElement).innerText ?? "";
        const priceM = text.match(/\$\s*([\d,]+)/);
        if (!priceM) continue;
        const price = parseInt(priceM[1].replace(/,/g, ""), 10);
        if (!Number.isFinite(price) || price > maxPrice) continue;
        const bedM = text.match(/(\d+)\s*(?:bd|bed|br)/i);
        const baM = text.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath)/i);
        const sqftM = text.match(/([\d,]+)\s*(?:sqft|sq\s*ft)/i);
        const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
        const addr = lines.find((l) => /\d.*(st|ave|blvd|rd|dr|ct|pl|way|ter)\b/i.test(l));
        const img = (root as HTMLElement).querySelector("img")?.getAttribute("src");
        out.push({
          sourceId: href.split("/").filter(Boolean).pop()!,
          href,
          title: (addr ?? lines[0] ?? "Trulia listing").slice(0, 200),
          price,
          addressLine: addr,
          bedrooms: bedM ? parseInt(bedM[1], 10) : undefined,
          bathrooms: baM ? parseFloat(baM[1]) : undefined,
          sqft: sqftM ? parseInt(sqftM[1].replace(/,/g, ""), 10) : undefined,
          img: img && img.startsWith("http") ? img : null,
        });
      }
      return out;
    }, ctx.maxPrice);

    return items.map((it: any) => ({
      source: "trulia",
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
