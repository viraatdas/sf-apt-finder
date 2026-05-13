import { sql, and, eq, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { mergeRaw } from "@/lib/dedup";
import { geocode } from "@/lib/geocode";
import { neighborhoodFor } from "@/lib/neighborhoods";
import { craigslist } from "./craigslist";
import { zillow } from "./zillow";
import { redfin } from "./redfin";
import { realtor } from "./realtor";
import { zumper } from "./zumper";
import { apifyScraper } from "./apify";
import type { RawListing, Scraper, ScrapeContext, Source } from "./types";

export const ALL_SCRAPERS: Scraper[] = [
  craigslist,
  zillow,
  redfin,
  realtor,
  zumper,
  apifyScraper("apartments-com"),
  apifyScraper("trulia"),
  apifyScraper("padmapper"),
  apifyScraper("hotpads"),
  apifyScraper("facebook"),
];

export interface ScrapeResult {
  totalRaw: number;
  totalMerged: number;
  newCount: number;
  updatedCount: number;
  unavailableCount: number;
  perSource: Record<Source, { raw: number; error?: string }>;
  newListings: Array<{ id: string; title: string; price: number; neighborhood?: string; url: string }>;
}

/** Sources we trust to mark listings as unavailable when missing.
 * Apify-backed sources are unreliable (token may be unset) — skip them. */
const RELIABLE_SOURCES: Source[] = ["craigslist", "zillow", "redfin", "realtor", "zumper"];

/** Grace window — only mark unavailable if we haven't seen it in 3+ days. */
const UNAVAILABLE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export async function runAllScrapers(ctx?: Partial<ScrapeContext>): Promise<ScrapeResult> {
  const context: ScrapeContext = {
    bedrooms: Number(process.env.SEARCH_BEDROOMS ?? 3),
    maxPrice: Number(process.env.SEARCH_MAX_PRICE ?? 9000),
    city: process.env.SEARCH_CITY ?? "san-francisco",
    ...ctx,
  };

  const perSource = {} as ScrapeResult["perSource"];
  const allRaw: RawListing[] = [];

  // Run scrapers in parallel; each logs to scrape_runs.
  const results = await Promise.allSettled(
    ALL_SCRAPERS.map(async (s) => {
      const start = Date.now();
      const [run] = await db
        .insert(schema.scrapeRuns)
        .values({ source: s.source })
        .returning({ id: schema.scrapeRuns.id });
      try {
        const raw = await s.scrape(context);
        await db
          .update(schema.scrapeRuns)
          .set({ rawCount: raw.length, finishedAt: new Date() })
          .where(sql`${schema.scrapeRuns.id} = ${run.id}`);
        return { source: s.source, raw, ms: Date.now() - start };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .update(schema.scrapeRuns)
          .set({ error: msg, finishedAt: new Date() })
          .where(sql`${schema.scrapeRuns.id} = ${run.id}`);
        return { source: s.source, raw: [] as RawListing[], error: msg, ms: Date.now() - start };
      }
    })
  );

  const reliableSucceeded = new Set<Source>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { source, raw, error } = r.value;
    perSource[source] = { raw: raw.length, error };
    allRaw.push(...raw);
    if (!error && RELIABLE_SOURCES.includes(source)) reliableSucceeded.add(source);
  }

  // Filter: SF only, bedrooms +/- 1 from target, within price
  const filtered = allRaw.filter((r) => {
    if (r.price > context.maxPrice) return false;
    if (r.bedrooms != null && r.bedrooms < context.bedrooms) return false;
    if (r.bedrooms != null && r.bedrooms > context.bedrooms + 2) return false;
    return true;
  });

  // Merge duplicates
  const merged = mergeRaw(filtered);

  // Geocode any without coords (rate-limited at 1 req/s — keep within function budget)
  let geocoded = 0;
  const geocodeBudget = Number(process.env.GEOCODE_BUDGET ?? 10);
  for (const m of merged) {
    if (geocoded >= geocodeBudget) break;
    if ((m.lat == null || m.lng == null) && m.addressLine) {
      const r = await geocode(m.addressLine);
      if (r) {
        m.lat = r.lat;
        m.lng = r.lng;
        geocoded++;
      }
    }
  }

  // Upsert into DB
  let newCount = 0;
  let updatedCount = 0;
  let unavailableCount = 0;
  const newListings: ScrapeResult["newListings"] = [];
  const seenThisRun = new Set<string>();

  for (const m of merged) {
    seenThisRun.add(m.id);
    const neighborhood = neighborhoodFor(m.lat, m.lng);
    const values = {
      id: m.id,
      title: m.title.slice(0, 500),
      addressLine: m.addressLine ?? null,
      neighborhood: neighborhood ?? null,
      zip: m.zip ?? null,
      lat: m.lat ?? null,
      lng: m.lng ?? null,
      bedrooms: m.bedrooms ?? null,
      bathrooms: m.bathrooms ?? null,
      sqft: m.sqft ?? null,
      price: m.price,
      pricesBySource: m.pricesBySource,
      description: m.description ?? null,
      photoUrls: m.photoUrls ?? [],
      sources: m.sources,
      raw: m.raw,
      lastSeenAt: new Date(),
    };

    const result = await db
      .insert(schema.listings)
      .values(values)
      .onConflictDoUpdate({
        target: schema.listings.id,
        set: {
          lastSeenAt: new Date(),
          price: sql`LEAST(${schema.listings.price}, EXCLUDED.price)`,
          pricesBySource: values.pricesBySource,
          sources: values.sources,
          photoUrls: values.photoUrls,
          neighborhood: values.neighborhood,
          lat: values.lat,
          lng: values.lng,
          // Revive a previously-unavailable listing if it shows up again
          status: "available",
          unavailableAt: null,
        },
      })
      .returning({ id: schema.listings.id, firstSeenAt: schema.listings.firstSeenAt });

    if (result[0]) {
      const isNew =
        new Date(result[0].firstSeenAt).getTime() > Date.now() - 60_000;
      if (isNew) {
        newCount++;
        newListings.push({
          id: m.id,
          title: m.title,
          price: m.price,
          neighborhood,
          url: m.sources[0]?.url ?? "",
        });
      } else {
        updatedCount++;
      }
    }
  }

  // Availability sweep — only run if at least one reliable source succeeded,
  // otherwise we might wrongly mark everything unavailable on a bad day.
  if (reliableSucceeded.size > 0) {
    const cutoff = new Date(Date.now() - UNAVAILABLE_AFTER_MS);
    const swept = await db
      .update(schema.listings)
      .set({ status: "unavailable", unavailableAt: new Date() })
      .where(
        and(
          eq(schema.listings.status, "available"),
          lt(schema.listings.lastSeenAt, cutoff)
        )
      )
      .returning({ id: schema.listings.id });
    unavailableCount = swept.length;
  }

  return {
    totalRaw: allRaw.length,
    totalMerged: merged.length,
    newCount,
    updatedCount,
    unavailableCount,
    perSource,
    newListings,
  };
}
