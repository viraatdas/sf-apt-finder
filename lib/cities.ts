import type { Source } from "@/lib/scrapers/types";

export const CITY_IDS = ["san-francisco", "vancouver"] as const;
export type CityId = (typeof CITY_IDS)[number];
export type ScraperKey = Source | `apify:${Source}`;

export const DEFAULT_CITY: CityId = "vancouver";

export const CITIES: Record<
  CityId,
  {
    name: string;
    shortName: string;
    currency: "USD" | "CAD";
    currencySymbol: "$";
    geocodeSuffix: string;
    defaultMaxPrice: number;
    defaultBedrooms: number | null;
    recipients: string[];
    sources: ScraperKey[];
    paused: boolean;
    mapCenter: [number, number];
    mapZoom: number;
  }
> = {
  "san-francisco": {
    name: "San Francisco",
    shortName: "SF",
    currency: "USD",
    currencySymbol: "$",
    geocodeSuffix: "San Francisco, CA",
    defaultMaxPrice: 9000,
    defaultBedrooms: 3,
    recipients: [
      "viraat.laldas@gmail.com",
      "sambruns2000@gmail.com",
      "bryanwee023@gmail.com",
      "Amosliew1999@gmail.com",
    ],
    sources: [
      "craigslist",
      "zillow",
      "redfin",
      "realtor",
      "zumper",
      "apify:zillow",
      "apify:apartments-com",
      "apify:trulia",
      "apify:padmapper",
      "apify:hotpads",
      "apify:facebook",
    ],
    paused: true,
    mapCenter: [37.7749, -122.4194],
    mapZoom: 12,
  },
  vancouver: {
    name: "Vancouver",
    shortName: "Vancouver",
    currency: "CAD",
    currencySymbol: "$",
    geocodeSuffix: "Vancouver, BC, Canada",
    defaultMaxPrice: 4000,
    defaultBedrooms: null,
    recipients: ["viraat@exla.ai"],
    sources: [
      "craigslist",
      "kijiji",
      "zumper",
      "apify:padmapper",
      "livrent",
      "rentals-ca",
      "apify:facebook",
    ],
    paused: false,
    mapCenter: [49.2827, -123.1207],
    mapZoom: 12,
  },
};

export function isCityId(value: string | null | undefined): value is CityId {
  return CITY_IDS.includes(value as CityId);
}

export function cityFromParam(value: string | null | undefined): CityId {
  return isCityId(value) ? value : DEFAULT_CITY;
}

export function activeCities(): CityId[] {
  return CITY_IDS.filter((city) => !CITIES[city].paused);
}

export function citySearchParams(city: CityId): string {
  return `?city=${encodeURIComponent(city)}`;
}

export function maxPriceFromParam(city: CityId, value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : CITIES[city].defaultMaxPrice;
}

export function contextDefaults(city: CityId) {
  const config = CITIES[city];
  return {
    city,
    bedrooms: config.defaultBedrooms,
    maxPrice: config.defaultMaxPrice,
  };
}

export function contextFromEnv(overrides: Partial<ReturnType<typeof contextDefaults>> = {}) {
  const city = cityFromParam(overrides.city ?? process.env.SEARCH_CITY);
  const config = CITIES[city];
  const envBedrooms =
    process.env.SEARCH_BEDROOMS != null && process.env.SEARCH_BEDROOMS !== ""
      ? Number(process.env.SEARCH_BEDROOMS)
      : undefined;
  const envMaxPrice =
    process.env.SEARCH_MAX_PRICE != null && process.env.SEARCH_MAX_PRICE !== ""
      ? Number(process.env.SEARCH_MAX_PRICE)
      : undefined;
  const bedrooms =
    overrides.bedrooms !== undefined ? overrides.bedrooms : (envBedrooms ?? config.defaultBedrooms);
  const maxPrice =
    overrides.maxPrice !== undefined ? overrides.maxPrice : (envMaxPrice ?? config.defaultMaxPrice);
  return {
    city,
    bedrooms: Number.isFinite(bedrooms) ? bedrooms : null,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : config.defaultMaxPrice,
  };
}
