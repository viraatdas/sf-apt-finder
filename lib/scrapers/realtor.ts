import type { RawListing, Scraper, ScrapeContext } from "./types";

/**
 * Realtor.com — uses their RDC GraphQL search endpoint. Often blocked from servers.
 * Returns [] on failure rather than throwing so the orchestrator keeps going.
 */
export const realtor: Scraper = {
  source: "realtor",
  async scrape(ctx: ScrapeContext): Promise<RawListing[]> {
    const body = {
      query: `query ConsumerSearchQuery($query: HomeSearchCriteria!, $limit: Int, $offset: Int, $sort: [SearchAPISort]) {
        home_search: home_search(query: $query, limit: $limit, offset: $offset, sort: $sort) {
          total
          results {
            property_id permalink
            list_price
            description { beds baths_consolidated sqft }
            location { address { line city state_code postal_code coordinate { lat lon } } }
            primary_photo { href }
          }
        }
      }`,
      variables: {
        query: {
          status: ["for_rent"],
          primary: true,
          search_location: { location: "San Francisco, CA" },
          beds: { min: ctx.bedrooms },
          list_price: { max: ctx.maxPrice },
        },
        limit: 200,
        offset: 0,
        sort: [{ field: "list_date", direction: "desc" }],
      },
    };

    try {
      const res = await fetch("https://www.realtor.com/api/v1/rdc_search_srp?client_id=rdc-x&schema=vesta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`realtor blocked: ${res.status}`);
        return [];
      }
      const data: any = await res.json();
      const results: any[] = data?.data?.home_search?.results ?? [];
      const now = new Date().toISOString();
      return results
        .map((r): RawListing => ({
          source: "realtor",
          sourceId: String(r.property_id),
          url: `https://www.realtor.com/realestateandhomes-detail/${r.permalink}`,
          title: r?.location?.address?.line ?? "Realtor listing",
          price: Number(r.list_price) || 0,
          bedrooms: r?.description?.beds,
          bathrooms: parseFloat(r?.description?.baths_consolidated ?? ""),
          sqft: r?.description?.sqft,
          addressLine: r?.location?.address?.line,
          zip: r?.location?.address?.postal_code,
          lat: r?.location?.address?.coordinate?.lat,
          lng: r?.location?.address?.coordinate?.lon,
          photoUrls: r?.primary_photo?.href ? [r.primary_photo.href] : [],
          scrapedAt: now,
          raw: r,
        }))
        .filter((l) => l.price > 0 && l.price <= ctx.maxPrice);
    } catch (err) {
      console.warn("realtor error", err);
      return [];
    }
  },
};
