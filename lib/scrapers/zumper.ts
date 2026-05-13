import type { RawListing, Scraper, ScrapeContext } from "./types";

/**
 * Zumper public search API. Sometimes works without auth from servers.
 */
export const zumper: Scraper = {
  source: "zumper",
  async scrape(ctx: ScrapeContext): Promise<RawListing[]> {
    const body = {
      bounds: {
        minLat: 37.705,
        maxLat: 37.835,
        minLng: -122.515,
        maxLng: -122.355,
      },
      bedrooms: [ctx.bedrooms, ctx.bedrooms + 1],
      priceMax: ctx.maxPrice,
      pets: {},
      page: 1,
      perPage: 200,
    };
    try {
      const res = await fetch("https://www.zumper.com/api/t/1/postings/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`zumper blocked: ${res.status}`);
        return [];
      }
      const data: any = await res.json();
      const results: any[] = data?.listings ?? data?.results ?? [];
      const now = new Date().toISOString();
      const out: RawListing[] = [];
      for (const r of results) {
        const price = Number(r?.price ?? r?.minPrice ?? r?.priceMin) || 0;
        if (!price || price > ctx.maxPrice) continue;
        out.push({
          source: "zumper",
          sourceId: String(r?.id ?? r?.listingId ?? r?.uuid),
          url: r?.url ?? `https://www.zumper.com${r?.canonicalUrl ?? ""}`,
          title: r?.title ?? r?.address ?? "Zumper listing",
          price,
          bedrooms: r?.bedrooms ?? r?.beds,
          bathrooms: r?.bathrooms ?? r?.baths,
          sqft: r?.sqft ?? r?.squareFeet,
          addressLine: r?.address,
          zip: r?.zipcode,
          lat: r?.lat ?? r?.latitude,
          lng: r?.lng ?? r?.longitude,
          photoUrls: r?.imageUrl ? [r.imageUrl] : [],
          scrapedAt: now,
          raw: r,
        });
      }
      return out;
    } catch (err) {
      console.warn("zumper error", err);
      return [];
    }
  },
};
