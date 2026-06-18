export type Source =
  | "craigslist"
  | "kijiji"
  | "zillow"
  | "redfin"
  | "realtor"
  | "apartments-com"
  | "trulia"
  | "padmapper"
  | "hotpads"
  | "zumper"
  | "livrent"
  | "rentals-ca"
  | "facebook";

/** A listing as scraped from a source, before dedup. */
export interface RawListing {
  source: Source;
  sourceId: string; // stable within a source
  url: string;
  title: string;
  price: number; // monthly rent in the city's currency
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  addressLine?: string;
  neighborhood?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  description?: string;
  photoUrls?: string[];
  scrapedAt: string; // ISO
  raw?: unknown;
}

export interface ScrapeContext {
  bedrooms: number | null;
  maxPrice: number;
  city: "san-francisco" | "vancouver";
}

export interface Scraper {
  source: Source;
  scrape(ctx: ScrapeContext): Promise<RawListing[]>;
}
