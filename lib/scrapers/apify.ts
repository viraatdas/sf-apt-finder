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

const SF_SEARCH_URLS = {
  /** Zillow requires the searchQueryState param to identify the filter set. */
  zillow: (beds: number, maxPrice: number) => {
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
        beds: { min: beds },
        monthlyPayment: { max: maxPrice },
      },
      isListVisible: true,
      mapZoom: 12,
      regionSelection: [{ regionId: 20330, regionType: 6 }],
    };
    return `https://www.zillow.com/san-francisco-ca/rentals/?searchQueryState=${encodeURIComponent(JSON.stringify(state))}`;
  },
  apartments: (beds: number, maxPrice: number) =>
    `https://www.apartments.com/san-francisco-ca/${beds}-bedrooms-under-${maxPrice}/`,
  padmapper: () => `https://www.padmapper.com/apartments/san-francisco-ca`,
  facebook: (beds: number, maxPrice: number) =>
    `https://www.facebook.com/marketplace/sanfrancisco/propertyrentals?minBedrooms=${beds}&maxPrice=${maxPrice}`,
};

const ACTORS: ApifyActor[] = [
  // Zillow — accepts searchUrls
  {
    source: "zillow",
    actorId: "maxcopell~zillow-scraper",
    buildInput: (ctx) => ({
      searchUrls: [{ url: SF_SEARCH_URLS.zillow(ctx.bedrooms, ctx.maxPrice) }],
      extractionMethod: "MAP_MARKERS",
    }),
    normalize: (r, ctx) => {
      const price =
        toMoney(r?.price) ||
        toMoney(r?.units?.[0]?.price) ||
        toMoney(r?.hdpData?.homeInfo?.price) ||
        0;
      if (!price || price > ctx.maxPrice) return null;
      const url =
        r?.detailUrl?.startsWith?.("http") ? r.detailUrl :
        r?.detailUrl ? `https://www.zillow.com${r.detailUrl}` :
        r?.url ?? null;
      if (!url) return null;
      return {
        source: "zillow",
        sourceId: String(r?.zpid ?? r?.id ?? url),
        url,
        title: r?.address ?? r?.statusText ?? "Zillow listing",
        price,
        bedrooms: r?.beds ?? r?.hdpData?.homeInfo?.bedrooms,
        bathrooms: r?.baths ?? r?.hdpData?.homeInfo?.bathrooms,
        sqft: r?.area ?? r?.hdpData?.homeInfo?.livingArea,
        addressLine: r?.address ?? r?.addressStreet,
        zip: r?.addressZipcode ?? r?.hdpData?.homeInfo?.zipcode,
        lat: r?.latLong?.latitude ?? r?.hdpData?.homeInfo?.latitude,
        lng: r?.latLong?.longitude ?? r?.hdpData?.homeInfo?.longitude,
        photoUrls: r?.imgSrc ? [r.imgSrc] : r?.carouselPhotos?.map((p: any) => p.url) ?? [],
        scrapedAt: new Date().toISOString(),
        raw: r,
      };
    },
  },
  // Apartments.com
  {
    source: "apartments-com",
    actorId: "pro100chok~apartments-scraper-usage",
    buildInput: (ctx) => ({
      startUrls: [{ url: SF_SEARCH_URLS.apartments(ctx.bedrooms, ctx.maxPrice) }],
      maxPages: 2,
      maxItems: 60,
      includeDetails: false,
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
      startUrls: [{ url: SF_SEARCH_URLS.padmapper() }],
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
      location: "San Francisco, CA",
      propertyType: "apartment",
      minBeds: ctx.bedrooms,
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
      location: "San Francisco, CA",
      propertyType: "apartment",
      minBeds: ctx.bedrooms,
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
