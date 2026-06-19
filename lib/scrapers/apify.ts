import type { RawListing, Scraper, ScrapeContext, Source } from "./types";

/**
 * Apify adapter. Actor IDs verified as of May 2026.
 *
 * Vercel Hobby caps functions at 60s, so we pass a per-actor sync timeout to
 * Apify; we get back whatever the actor finished within that window.
 */

const APIFY_TIMEOUT_SECONDS = 180;
const APIFY_MEMORY_MB = 512;
const MIN_PADMAPPER_RENT = 500;
const DEFAULT_PADMAPPER_MAX_ITEMS = 10;
const DEFAULT_FACEBOOK_MAX_ITEMS = 50;

interface ApifyActor {
  source: Source;
  actorId: string; // slug form, e.g. "maxcopell~zillow-scraper"
  buildInput: (ctx: ScrapeContext) => Record<string, unknown>;
  normalize: (row: any, ctx: ScrapeContext) => RawListing | null;
}

type NormalizedFloorplan = {
  raw: any;
  price: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  title?: string;
};

const SEARCH_URLS = {
  /** Zillow requires searchQueryState with their SHORT filter keys (fr/fsba/beds/price)
   * for rentals, not the long names. Long names silently return 0 results. */
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
      ? "https://www.padmapper.com/apartments/vancouver-bc?box=-123.2247,49.198,-123.023,49.316"
      : "https://www.padmapper.com/apartments/san-francisco-ca?box=-122.515,37.705,-122.355,37.835",
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

const FACEBOOK_CITY_SLUG_BY_CITY = {
  "san-francisco": "sanfrancisco",
  vancouver: "vancouver",
} as const;

const APIFY_PROXY_BY_CITY = {
  "san-francisco": {
    useApifyProxy: true,
    apifyProxyGroups: ["RESIDENTIAL"],
    apifyProxyCountry: "US",
  },
  vancouver: {
    useApifyProxy: true,
    apifyProxyGroups: ["RESIDENTIAL"],
    apifyProxyCountry: "CA",
  },
} as const;

const ACTORS: ApifyActor[] = [
  // Zillow via igolaizola/zillow-scraper-ppe returns full photo galleries.
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
  // Apartments.com: set includeDetails:true to get full photo gallery per listing.
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
  // Padmapper pay-per-result actor. maxChargedResults caps daily spend.
  {
    source: "padmapper",
    actorId: "lexis-solutions~padmapper-scraper",
    buildInput: (ctx) => ({
      startUrls: [{ url: SEARCH_URLS.padmapper(ctx.city) }],
      maxItems: envInt("APIFY_PADMAPPER_MAX_ITEMS", DEFAULT_PADMAPPER_MAX_ITEMS),
      maxChargedResults: envInt("APIFY_PADMAPPER_MAX_ITEMS", DEFAULT_PADMAPPER_MAX_ITEMS),
      proxyConfiguration: APIFY_PROXY_BY_CITY[ctx.city],
    }),
    normalize: (r, ctx) => padmapperNormalize(r, ctx),
  },
  // HotPads pay-per-result.
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
  // Zumper pay-per-result.
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
  // Facebook Marketplace pay-per-event. Normal mode returns the listing images.
  {
    source: "facebook",
    actorId: "parseforge~facebook-marketplace-scraper",
    buildInput: (ctx) => ({
      searchQueries: [
        {
          city: FACEBOOK_CITY_SLUG_BY_CITY[ctx.city],
          query: "apartment for rent",
        },
      ],
      maxItems: envInt("APIFY_FACEBOOK_MAX_ITEMS", DEFAULT_FACEBOOK_MAX_ITEMS),
      enrichListings: false,
      proxyConfiguration: APIFY_PROXY_BY_CITY[ctx.city],
    }),
    normalize: (r, ctx) => facebookNormalize(r, ctx),
  },
];

function toMoney(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const m = v.match(/[\d,]+/);
  return m ? parseInt(m[0].replace(/,/g, ""), 10) : 0;
}

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
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

function padmapperNormalize(r: any, ctx: ScrapeContext): RawListing | null {
  const floorplans = Array.isArray(r?.floorplans) ? r.floorplans : [];
  const matchingFloorplans = floorplans
    .map((floorplan: any): NormalizedFloorplan => ({
      raw: floorplan,
      price: toMoney(floorplan?.price),
      bedrooms: numOr(floorplan?.bedrooms, floorplan?.beds),
      bathrooms: numOr(floorplan?.bathrooms, floorplan?.baths),
      sqft: numOr(floorplan?.squareFeet, floorplan?.sqft, floorplan?.size),
      title: typeof floorplan?.title === "string" ? floorplan.title : undefined,
    }))
    .filter((floorplan: NormalizedFloorplan) => {
      if (floorplan.price < MIN_PADMAPPER_RENT || floorplan.price > ctx.maxPrice) return false;
      if (ctx.bedrooms != null && floorplan.bedrooms != null && floorplan.bedrooms < ctx.bedrooms) {
        return false;
      }
      if (ctx.bedrooms != null && floorplan.bedrooms != null && floorplan.bedrooms > ctx.bedrooms + 2) {
        return false;
      }
      return true;
    })
    .sort((a: NormalizedFloorplan, b: NormalizedFloorplan) => a.price - b.price);

  const floorplan = matchingFloorplans[0];
  const price =
    floorplan?.price ||
    toMoney(r?.price) ||
    toMoney(r?.rent) ||
    toMoney(r?.minPrice) ||
    toMoney(r?.priceRange?.min);
  if (price < MIN_PADMAPPER_RENT || price > ctx.maxPrice) return null;

  const url = r?.url ?? r?.detailUrl ?? r?.link ?? r?.listingUrl;
  if (!url) return null;
  const title = [r?.name ?? r?.title ?? r?.address, floorplan?.title].filter(Boolean).join(" - ");
  return {
    source: "padmapper",
    sourceId: String(r?.listingId ?? floorplan?.raw?.listingId ?? r?.buildingId ?? url),
    url,
    title: title || "PadMapper listing",
    price,
    bedrooms: floorplan?.bedrooms ?? numOr(r?.bedrooms, r?.beds, r?.bedroomCount),
    bathrooms: floorplan?.bathrooms ?? numOr(r?.bathrooms, r?.baths, r?.bathroomCount),
    sqft: floorplan?.sqft ?? numOr(r?.sqft, r?.squareFeet, r?.size),
    addressLine: r?.formattedAddress ?? r?.address ?? r?.location?.address ?? r?.fullAddress,
    zip: r?.zipcode ?? r?.zip ?? r?.postalCode,
    lat: numOr(r?.lat, r?.latitude, r?.location?.lat, r?.coordinates?.lat),
    lng: numOr(r?.lng, r?.lon, r?.longitude, r?.location?.lng, r?.coordinates?.lng),
    photoUrls: pickPhotos(r),
    description: Array.isArray(r?.amenities) ? r.amenities.join(", ") : r?.description,
    scrapedAt: new Date().toISOString(),
    raw: r,
  };
}

function facebookNormalize(r: any, ctx: ScrapeContext): RawListing | null {
  if (r?.listingType && !["rental", "home-for-sale"].includes(r.listingType)) return null;
  const price = toMoney(r?.price ?? r?.priceText ?? r?.amount);
  if (!price || price > ctx.maxPrice) return null;
  const url = r?.url ?? r?.listingUrl;
  if (!url) return null;
  const bedrooms = numOr(r?.bedrooms, r?.beds, r?.bedroomCount);
  if (ctx.bedrooms != null && bedrooms != null && bedrooms < ctx.bedrooms) return null;
  if (ctx.bedrooms != null && bedrooms != null && bedrooms > ctx.bedrooms + 2) return null;
  return {
    source: "facebook",
    sourceId: String(r?.listingId ?? r?.id ?? url),
    url,
    title: r?.title ?? r?.name ?? "Facebook Marketplace rental",
    price,
    bedrooms,
    bathrooms: numOr(r?.bathrooms, r?.baths, r?.bathroomCount),
    sqft: numOr(r?.sqft, r?.squareFeet, r?.size),
    addressLine: r?.address ?? r?.locationText ?? r?.location,
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
  const photos = new Set<string>();
  collectPhotos(r, photos, 0, false);
  return Array.from(photos).slice(0, 12);
}

function collectPhotos(value: unknown, out: Set<string>, depth: number, photoContext: boolean): void {
  if (depth > 7 || value == null) return;

  if (typeof value === "string") {
    const url = normalizePhotoUrl(value);
    if (url && (photoContext || isLikelyPhotoUrl(url))) out.add(url);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectPhotos(item, out, depth + 1, photoContext);
    return;
  }

  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const mediaUrl = photoUrlFromMediaObject(obj);
  if (mediaUrl) out.add(mediaUrl);
  for (const [key, child] of Object.entries(obj)) {
    const nextPhotoContext = photoContext || isPhotoKey(key);
    if (nextPhotoContext || depth < 3) {
      collectPhotos(child, out, depth + 1, nextPhotoContext);
    }
  }
}

function isPhotoKey(key: string): boolean {
  return /photo|image|media|picture|thumbnail|cover|gallery|carousel|large|medium|small|src|url/i.test(key);
}

function photoUrlFromMediaObject(obj: Record<string, unknown>): string | null {
  const mediaType = obj.media_type ?? obj.mediaType;
  if (mediaType != null && mediaType !== 1 && mediaType !== "1" && mediaType !== "photo" && mediaType !== "image") {
    return null;
  }

  const id = obj.media_id ?? obj.mediaId ?? obj.image_id ?? obj.imageId;
  if ((typeof id !== "number" && typeof id !== "string") || String(id).trim() === "") return null;
  return `https://img.zumpercdn.com/${String(id).trim()}/1280x960`;
}

function normalizePhotoUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (!isLikelyPhotoUrl(trimmed)) return null;
  return trimmed.replace(/&amp;/g, "&");
}

function isLikelyPhotoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (/\/logos?\//.test(lower) || /logo|wordmark/.test(lower)) return false;
  if (/\.(?:html?|php|aspx)(?:[?#].*)?$/i.test(lower)) return false;
  if (lower.includes("/marketplace/") || lower.includes("/apartment/") || lower.includes("/rentals/")) {
    return /\.(jpe?g|png|webp)(?:[?#].*)?$/i.test(lower);
  }
  return (
    /\.(jpe?g|png|webp)(?:[?#].*)?$/i.test(lower) ||
    /fbcdn|zumpercdn|cloudfront|ctfassets|images|photos|imgix|rentals\.ca|liv\.rent/i.test(lower)
  );
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
