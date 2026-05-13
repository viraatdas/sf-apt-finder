export type Source =
  | "craigslist"
  | "zillow"
  | "redfin"
  | "realtor"
  | "apartments-com"
  | "trulia"
  | "padmapper"
  | "hotpads"
  | "zumper"
  | "facebook";

/** A listing as scraped from a source, before dedup. */
export interface RawListing {
  source: Source;
  sourceId: string; // stable within a source
  url: string;
  title: string;
  price: number; // monthly $, USD
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
  bedrooms: number;
  maxPrice: number;
  city: string; // "san-francisco"
}

export interface Scraper {
  source: Source;
  scrape(ctx: ScrapeContext): Promise<RawListing[]>;
}
