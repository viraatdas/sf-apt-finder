import type { RawListing, Scraper, ScrapeContext, Source } from "./types";

/**
 * Apify adapter — verified actor IDs as of May 2026.
 *
 * Vercel Hobby caps functions at 60s, so we pass a per-actor sync timeout to
 * Apify; we get back whatever the actor finished within that window.
 */

const APIFY_TIMEOUT_SECONDS = 40;
const APIFY_MEMORY_MB = 512;

interface ApifyActor {
  source: Source;
  actorId: string; // slug form, e.g. "maxcopell~zillow-scraper"
  buildInput: (ctx: ScrapeContext) => Record<string, unknown>;
  normalize: (row: any, ctx: ScrapeContext) => RawListing | null;
}

const SEARCH_URLS = {
  /** Zillow requires searchQueryState with their SHORT filter keys (fr/fsba/beds/price)
   * for rentals — not the long names. Long names silently return 0 results. */
  zillow: (city: ScrapeContext["city"], beds: number, maxPrice: number) => {
    if (city !== "san-francisco") return "";
    const state = {
      pagination: {},
      isMapVisible: true,
      mapBounds: { west: -122.515, east: -122.355, south: 37.705, north: 37.835 },
      filterState: {
        fr: { value: true }, // for rent
        fsba: { value: false },
        fsbo: { value: false },
        nc: { value: false },
        cmsn: { value: false },
        auc: { value: false },
        fore: { value: false },
        ah: { value: true }, // apartment / home
        beds: { min: beds },
        price: { max: maxPrice }, // monthly rent
        mp: { max: maxPrice },
      },
      isListVisible: true,
      mapZoom: 12,
      regionSelection: [{ regionId: 20330, regionType: 6 }],
    };
    return `https://www.zillow.com/san-francisco-ca/rentals/?searchQueryState=${encodeURIComponent(JSON.stringify(state))}`;
  },
  apartments: (city: ScrapeContext["city"], beds: number, maxPrice: number) =>
    city === "san-francisco"
      ? `https://www.apartments.com/san-francisco-ca/${beds}-bedrooms-under-${maxPrice}/`
      : "",
  padmapper: (city: ScrapeContext["city"]) =>
    city === "vancouver"
      ? "https://www.padmapper.com/apartments/vancouver-bc"
      : "https://www.padmapper.com/apartments/san-francisco-ca",
  facebook: (city: ScrapeContext["city"], beds: number | null, maxPrice: number) => {
    const market = city === "vancouver" ? "vancouver" : "sanfrancisco";
    const bedsParam = beds == null ? "" : `&minBedrooms=${beds}`;
    return `https://www.facebook.com/marketplace/${market}/propertyrentals?maxPrice=${maxPrice}${bedsParam}`;
  },
};

const LOCATION_BY_CITY = {
  "san-francisco": "San Francisco, CA",
  vancouver: "Vancouver, BC",
} as const;

const ACTORS: ApifyActor[] = [
  // Zillow via igolaizola/zillow-scraper-ppe — returns full photo galleries.
  // Pay-per-result: ~$0.0009 per listing on BRONZE plan. ~150 SF listings = ~$0.14/run.
  {
    source: "zillow",
    actorId: "igolaizola~zillow-scraper-ppe",
    buildInput: (ctx) => ({
      location: LOCATION_BY_CITY[ctx.city],
      operation: "rent",
      ...(ctx.bedrooms == null ? {} : { minBeds: ctx.bedrooms }),
      maxPrice: ctx.maxPrice,
      maxItems: 200,
    }),
    normalize: (r, ctx) => {
      const price = typeof r?.price?.value === "number" ? r.price.value : toMoney(r?.price);
      if (!price || price > ctx.maxPrice) return null;
      const detailPath = r?.url ?? `/homedetails/${r?.zpid}_zpid/`;
      const url = detailPath.startsWith("http") ? detailPath : `https://www.zillow.com${detailPath}`;
      const photos: string[] = [];
      const hi = r?.media?.allPropertyPhotos?.highResolution;
      if (Array.isArray(hi)) {
        for (const p of hi) if (typeof p === "string" && p.startsWith("http")) photos.push(p);
      }
      const addr = r?.address ?? {};
      const addressLine = [addr.streetAddress, addr.city, addr.state].filter(Boolean).join(", ");
      return {
        source: "zillow",
        sourceId: String(r?.zpid ?? url),
        url,
        title: addressLine || r?.title || "Zillow listing",
        price,
        bedrooms: typeof r?.bedrooms === "number" ? r.bedrooms : undefined,
        bathrooms: typeof r?.bathrooms === "number" ? r.bathrooms : undefined,
        sqft: typeof r?.livingArea === "number" ? r.livingArea : undefined,
        addressLine: addr.streetAddress ?? addressLine,
        zip: addr.zipcode,
        lat: r?.location?.latitude,
        lng: r?.location?.longitude,
        photoUrls: photos.slice(0, 12),
        scrapedAt: new Date().toISOString(),
        raw: r,
      };
    },
  },
  // Apartments.com — set includeDetails:true to get full photo gallery per listing.
  {
    source: "apartments-com",
    actorId: "pro100chok~apartments-scraper-usage",
    buildInput: (ctx) => ({
      startUrls:
        ctx.bedrooms == null
          ? []
          : [{ url: SEARCH_URLS.apartments(ctx.city, ctx.bedrooms, ctx.maxPrice) }],
      maxPages: 2,
      maxItems: 60,
      includeDetails: true,
    }),
    normalize: (r, ctx) => genericNormalize(r, "apartments-com", ctx),
  },
  // Trulia & Realtor.com require a paid Apify actor (HTTP 402 on free plan).
  // To enable: upgrade Apify or swap to a free-plan-friendly scraper.
  // Padmapper — pay-per-result actor; maxChargedResults caps cost on free credit.
  {
    source: "padmapper",
    actorId: "lexis-solutions~padmapper-scraper",
    buildInput: (ctx) => ({
      startUrls: [{ url: SEARCH_URLS.padmapper(ctx.city) }],
      maxItems: 30,
      maxChargedResults: 30,
    }),
    normalize: (r, ctx) => genericNormalize(r, "padmapper", ctx),
  },
  // HotPads — pay-per-result
  {
    source: "hotpads",
    actorId: "benthepythondev~hotpads-rental-scraper",
    buildInput: (ctx) => ({
      mode: "search",
      location: LOCATION_BY_CITY[ctx.city],
      propertyType: "apartment",
      ...(ctx.bedrooms == null ? {} : { minBeds: ctx.bedrooms }),
      maxPrice: ctx.maxPrice,
      maxListings: 30,
      maxChargedResults: 30,
      includePhotos: true,
    }),
    normalize: (r, ctx) => genericNormalize(r, "hotpads", ctx),
  },
  // Zumper — pay-per-result
  {
    source: "zumper",
    actorId: "benthepythondev~zumper-rental-scraper",
    buildInput: (ctx) => ({
      mode: "search",
      location: LOCATION_BY_CITY[ctx.city],
      propertyType: "apartment",
      ...(ctx.bedrooms == null ? {} : { minBeds: ctx.bedrooms }),
      maxPrice: ctx.maxPrice,
      maxListings: 30,
      maxChargedResults: 30,
      includePhotos: true,
    }),
    normalize: (r, ctx) => genericNormalize(r, "zumper", ctx),
  },
  // Facebook Marketplace: official actor requires paid Apify plan (402 on FREE).
  // To enable: upgrade Apify, then re-add an entry here pointing to the apify~facebook-marketplace-scraper.
];

function toMoney(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const m = v.match(/[\d,]+/);
  return m ? parseInt(m[0].replace(/,/g, ""), 10) : 0;
}

function genericNormalize(r: any, source: Source, ctx: ScrapeContext): RawListing | null {
  const price =
    toMoney(r?.price) ||
    toMoney(r?.rent) ||
    toMoney(r?.minPrice) ||
    toMoney(r?.price_min) ||
    toMoney(r?.priceRange?.min) ||
    0;
  if (!price || price > ctx.maxPrice) return null;
  const url = r?.url ?? r?.detailUrl ?? r?.link ?? r?.listingUrl;
  if (!url) return null;
  return {
    source,
    sourceId: String(r?.id ?? r?.listingId ?? r?.zpid ?? url),
    url,
    title: r?.title ?? r?.address ?? r?.name ?? `${source} listing`,
    price,
    bedrooms: numOr(r?.bedrooms, r?.beds, r?.bedroomCount),
    bathrooms: numOr(r?.bathrooms, r?.baths, r?.bathroomCount),
    sqft: numOr(r?.sqft, r?.squareFeet, r?.size),
    addressLine: r?.address ?? r?.location?.address ?? r?.fullAddress,
    zip: r?.zipcode ?? r?.zip ?? r?.postalCode,
    lat: numOr(r?.lat, r?.latitude, r?.location?.lat, r?.coordinates?.lat),
    lng: numOr(r?.lng, r?.lon, r?.longitude, r?.location?.lng, r?.coordinates?.lng),
    photoUrls: pickPhotos(r),
    description: r?.description,
    scrapedAt: new Date().toISOString(),
    raw: r,
  };
}

function numOr(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function pickPhotos(r: any): string[] {
  const candidates =
    r?.images ?? r?.photos ?? r?.photoUrls ?? r?.imageUrls ?? r?.imageUrl ?? r?.image;
  if (typeof candidates === "string") return [candidates];
  if (Array.isArray(candidates)) {
    return candidates
      .map((c) => (typeof c === "string" ? c : c?.url ?? c?.src))
      .filter((s): s is string => typeof s === "string")
      .slice(0, 6);
  }
  return [];
}

async function runActor(actor: ApifyActor, token: string, ctx: ScrapeContext): Promise<RawListing[]> {
  const url = `https://api.apify.com/v2/acts/${actor.actorId}/run-sync-get-dataset-items?token=${token}&timeout=${APIFY_TIMEOUT_SECONDS}&memory=${APIFY_MEMORY_MB}&format=json`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actor.buildInput(ctx)),
      signal: AbortSignal.timeout((APIFY_TIMEOUT_SECONDS + 5) * 1000),
    });
    if (!res.ok) {
      console.warn(`apify ${actor.source} ${res.status}: ${await res.text().catch(() => "")}`);
      return [];
    }
    const rows: any[] = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => actor.normalize(r, ctx))
      .filter((x): x is RawListing => x !== null);
  } catch (err) {
    console.warn(`apify ${actor.source} error`, err);
    return [];
  }
}

export function apifyScraper(source: Source): Scraper {
  const actor = ACTORS.find((a) => a.source === source);
  return {
    source,
    async scrape(ctx) {
      const token = process.env.APIFY_TOKEN;
      if (!token || !actor) return [];
      return runActor(actor, token, ctx);
    },
  };
}
