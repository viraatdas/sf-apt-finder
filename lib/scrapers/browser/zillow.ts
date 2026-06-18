import type { Page } from "playwright";
import type { RawListing, ScrapeContext } from "../types";
import type { BrowserScraper } from "./index";

/**
 * Zillow — heaviest bot defense. Stealth alone gets denied, but Zillow ships its
 * full result set inside <script id="__NEXT_DATA__"> when the page renders.
 * Strategy: render with stealth, extract from __NEXT_DATA__ even if visible UI
 * is gated by a soft block.
 */
export const zillow: BrowserScraper = {
  source: "zillow",
  async scrape(ctx: ScrapeContext, page: Page): Promise<RawListing[]> {
    if (ctx.city !== "san-francisco" || ctx.bedrooms == null) return [];
    const state = {
      pagination: {},
      isMapVisible: true,
      mapBounds: { west: -122.515, east: -122.355, south: 37.705, north: 37.835 },
      filterState: {
        isForRent: { value: true },
        isForSaleByAgent: { value: false },
        isForSaleByOwner: { value: false },
        isNewConstruction: { value: false },
        isComingSoon: { value: false },
        isAuction: { value: false },
        isForSaleForeclosure: { value: false },
        beds: { min: ctx.bedrooms },
        monthlyPayment: { max: ctx.maxPrice },
      },
      isListVisible: true,
      mapZoom: 12,
      regionSelection: [{ regionId: 20330, regionType: 6 }],
    };
    const url =
      "https://www.zillow.com/san-francisco-ca/rentals/?searchQueryState=" +
      encodeURIComponent(JSON.stringify(state));

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);
    const title = await page.title();
    if (/denied|access|robot/i.test(title)) {
      console.log(`[zillow] blocked: ${title}`);
      return [];
    }

    const homes = await page.evaluate(() => {
      const el = document.querySelector("script#__NEXT_DATA__");
      if (!el) return null;
      try {
        const data = JSON.parse(el.textContent ?? "");
        const stack: any[] = [data];
        while (stack.length) {
          const n = stack.pop();
          if (n && typeof n === "object") {
            if (Array.isArray(n?.cat1?.searchResults?.listResults)) {
              return n.cat1.searchResults.listResults;
            }
            if (Array.isArray(n?.listResults)) return n.listResults;
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
    if (!Array.isArray(homes)) {
      console.log(`[zillow] no listResults in __NEXT_DATA__`);
      return [];
    }
    console.log(`[zillow] ${homes.length} homes in __NEXT_DATA__`);
    const out: RawListing[] = [];
    for (const r of homes) {
      const priceRaw = r?.price ?? r?.units?.[0]?.price ?? r?.hdpData?.homeInfo?.price;
      const price =
        typeof priceRaw === "number"
          ? priceRaw
          : typeof priceRaw === "string"
            ? parseInt(priceRaw.replace(/[^\d]/g, ""), 10)
            : 0;
      if (!price || price > ctx.maxPrice) continue;
      const det = r?.detailUrl?.startsWith("http") ? r.detailUrl : r?.detailUrl ? `https://www.zillow.com${r.detailUrl}` : null;
      if (!det) continue;
      out.push({
        source: "zillow",
        sourceId: String(r?.zpid ?? r?.id ?? det),
        url: det,
        title: r?.address ?? r?.statusText ?? "Zillow listing",
        price,
        bedrooms: r?.beds ?? r?.hdpData?.homeInfo?.bedrooms,
        bathrooms: r?.baths ?? r?.hdpData?.homeInfo?.bathrooms,
        sqft: r?.area ?? r?.hdpData?.homeInfo?.livingArea,
        addressLine: r?.address ?? r?.addressStreet,
        zip: r?.addressZipcode ?? r?.hdpData?.homeInfo?.zipcode,
        lat: r?.latLong?.latitude ?? r?.hdpData?.homeInfo?.latitude,
        lng: r?.latLong?.longitude ?? r?.hdpData?.homeInfo?.longitude,
        photoUrls: r?.imgSrc
          ? [r.imgSrc]
          : Array.isArray(r?.carouselPhotos)
            ? r.carouselPhotos.map((p: any) => p?.url).filter(Boolean).slice(0, 6)
            : [],
        scrapedAt: now,
        raw: r,
      });
    }
    return out;
  },
};
