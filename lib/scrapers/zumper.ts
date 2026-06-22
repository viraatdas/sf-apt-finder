import type { RawListing, Scraper, ScrapeContext } from "./types";

/**
 * Zumper server-rendered search page. The old public search API now 404s,
 * but the page still embeds current results in window.__PRELOADED_STATE__.
 */
const SEARCH_SLUGS = {
  "san-francisco": "san-francisco-ca",
  vancouver: "vancouver-bc",
  columbus: "columbus-oh",
} as const;

export const zumper: Scraper = {
  source: "zumper",
  async scrape(ctx: ScrapeContext): Promise<RawListing[]> {
    const url = new URL(
      `https://www.zumper.com/apartments-for-rent/${SEARCH_SLUGS[ctx.city]}${
        ctx.bedrooms == null ? "" : `/${ctx.bedrooms}-bedrooms`
      }`
    );
    url.searchParams.set("max_price", String(ctx.maxPrice));

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) {
        console.warn(`zumper blocked: ${res.status}`);
        return [];
      }
      const html = await res.text();
      const results = parsePreloadedListables(html);
      const now = new Date().toISOString();
      const out: RawListing[] = [];
      const seen = new Set<string>();

      for (const r of results) {
        const price = numOr(r?.min_price, r?.price, r?.minPrice) ?? 0;
        if (!price || price > ctx.maxPrice) continue;
        const minBeds = numOr(r?.min_bedrooms, r?.bedrooms);
        const maxBeds = numOr(r?.max_bedrooms, r?.bedrooms) ?? minBeds;
        if (ctx.bedrooms != null && maxBeds != null && maxBeds < ctx.bedrooms) continue;
        if (ctx.bedrooms != null && minBeds != null && minBeds > ctx.bedrooms + 2) continue;
        const detailUrl = absoluteUrl(r?.url);
        const sourceId = String(r?.listing_id ?? r?.group_id ?? detailUrl);
        if (!detailUrl || seen.has(sourceId)) continue;
        seen.add(sourceId);

        const title = [r?.building_name, r?.title].filter(Boolean).join(" - ") || "Zumper listing";
        const address = [r?.address, r?.city, r?.state].filter(Boolean).join(", ");
        out.push({
          source: "zumper",
          sourceId,
          url: detailUrl,
          title,
          price,
          bedrooms: minBeds,
          bathrooms: numOr(r?.min_bathrooms, r?.bathrooms),
          sqft: numOr(r?.min_square_feet, r?.sqft),
          addressLine: address || undefined,
          neighborhood: typeof r?.neighborhood_name === "string" ? r.neighborhood_name : undefined,
          zip: cleanZip(r?.zipcode),
          lat: numOr(r?.lat),
          lng: numOr(r?.lng),
          photoUrls: photosFromImageIds(r?.image_ids),
          description: descriptionFor(r),
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

function parsePreloadedListables(html: string): any[] {
  const script = Array.from(html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))
    .map((m) => m[1])
    .find((s) => s.includes("window.__PRELOADED_STATE__"));
  if (!script) return [];

  const marker = "window.__PRELOADED_STATE__ = ";
  const start = script.indexOf(marker);
  if (start < 0) return [];
  const jsonStart = start + marker.length;
  const jsonEnd = script.indexOf(";\n      window.__GIT_SHA__", jsonStart);
  if (jsonEnd < 0) return [];

  try {
    const state = JSON.parse(script.slice(jsonStart, jsonEnd));
    const listables = state?.currentSearch?.listables ?? {};
    return [
      ...(Array.isArray(listables.featured) ? listables.featured : []),
      ...(Array.isArray(listables.listables) ? listables.listables : []),
    ];
  } catch (err) {
    console.warn("zumper state parse error", err);
    return [];
  }
}

function absoluteUrl(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  return value.startsWith("http") ? value : new URL(value, "https://www.zumper.com").toString();
}

function photosFromImageIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((id): id is number | string => typeof id === "number" || typeof id === "string")
    .slice(0, 8)
    .map((id) => `https://img.zumpercdn.com/${id}/1280x960`);
}

function numOr(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function cleanZip(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.includes("None") ? undefined : value;
}

function descriptionFor(row: any): string | undefined {
  if (typeof row?.short_description === "string" && row.short_description.trim()) {
    return row.short_description.slice(0, 2000);
  }
  const tags = [
    ...(Array.isArray(row?.amenity_tags) ? row.amenity_tags : []),
    ...(Array.isArray(row?.building_amenity_tags) ? row.building_amenity_tags : []),
  ].filter((value: unknown): value is string => typeof value === "string");
  return tags.length ? tags.slice(0, 30).join(", ") : undefined;
}
