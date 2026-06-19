import type { RawListing, Scraper, ScrapeContext } from "./types";

/**
 * Zillow rentals search via the async JSON endpoint.
 * Frequently blocked from serverless IPs. If it 403s we just return [].
 */
export const zillow: Scraper = {
  source: "zillow",
  async scrape(ctx: ScrapeContext): Promise<RawListing[]> {
    if (ctx.city !== "san-francisco" || ctx.bedrooms == null) return [];
    const searchQueryState = {
      pagination: {},
      isMapVisible: true,
      mapBounds: {
        west: -122.515,
        east: -122.355,
        south: 37.705,
        north: 37.835,
      },
      filterState: {
        isForRent: { value: true },
        isForSaleByAgent: { value: false },
        isForSaleByOwner: { value: false },
        isNewConstruction: { value: false },
        isComingSoon: { value: false },
        isAuction: { value: false },
        isForSaleForeclosure: { value: false },
        beds: { min: ctx.bedrooms, max: ctx.bedrooms + 1 },
        monthlyPayment: { max: ctx.maxPrice },
      },
      isListVisible: true,
      mapZoom: 12,
      regionSelection: [{ regionId: 20330, regionType: 6 }], // SF
    };

    const url =
      "https://www.zillow.com/async-create-search-page-state/" +
      "?searchQueryState=" +
      encodeURIComponent(JSON.stringify(searchQueryState));

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.zillow.com/san-francisco-ca/rentals/",
    };

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.warn(`zillow blocked: ${res.status}`);
        return [];
      }
      const data: any = await res.json();
      const results: any[] = data?.cat1?.searchResults?.listResults ?? [];
      const now = new Date().toISOString();
      const out: RawListing[] = [];

      for (const r of results) {
        const price = parseMoney(r?.price ?? r?.units?.[0]?.price);
        if (!Number.isFinite(price) || price > ctx.maxPrice) continue;
        out.push({
          source: "zillow",
          sourceId: String(r?.id ?? r?.zpid ?? r?.detailUrl),
          url: r?.detailUrl?.startsWith("http")
            ? r.detailUrl
            : `https://www.zillow.com${r?.detailUrl ?? ""}`,
          title: r?.statusText ?? r?.address ?? "Zillow listing",
          price,
          bedrooms: typeof r?.beds === "number" ? r.beds : undefined,
          bathrooms: typeof r?.baths === "number" ? r.baths : undefined,
          sqft: typeof r?.area === "number" ? r.area : undefined,
          addressLine: r?.address ?? r?.addressStreet,
          zip: r?.addressZipcode,
          lat: r?.latLong?.latitude,
          lng: r?.latLong?.longitude,
          photoUrls: r?.imgSrc ? [r.imgSrc] : [],
          scrapedAt: now,
          raw: r,
        });
      }
      return out;
    } catch (err) {
      console.warn("zillow error", err);
      return [];
    }
  },
};

function parseMoney(s: unknown): number {
  if (typeof s === "number") return s;
  if (typeof s !== "string") return NaN;
  const m = s.match(/\$?([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : NaN;
}
