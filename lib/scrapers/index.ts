import { sql } from "drizzle-orm";
import { CITIES, cityFromParam, contextFromEnv, type CityId } from "@/lib/cities";
import { db, schema } from "@/lib/db";
import { craigslist } from "./craigslist";
import { kijiji } from "./kijiji";
import { zillow } from "./zillow";
import { redfin } from "./redfin";
import { realtor } from "./realtor";
import { zumper } from "./zumper";
import { apifyScraper } from "./apify";
import { ingestRawListings } from "./ingest";
import type { RawListing, ScrapeProgressEvent, Scraper, ScrapeContext, Source } from "./types";

const DIRECT_SCRAPERS: Partial<Record<Source, Scraper>> = {
  craigslist,
  kijiji,
  // Direct-HTTP zillow stays as a no-op (always 403 from cloud IPs).
  // The real Zillow data comes from apifyScraper("zillow") below.
  zillow,
  redfin,
  realtor,
  zumper,
};

export function scrapersFor(city: CityId): Scraper[] {
  return CITIES[city].sources.flatMap((key) => {
    if (key.startsWith("apify:")) {
      return [apifyScraper(key.slice("apify:".length) as Source)];
    }
    const scraper = DIRECT_SCRAPERS[key as Source];
    return scraper ? [scraper] : [];
  });
}

export interface ScrapeResult {
  totalRaw: number;
  totalMerged: number;
  newCount: number;
  updatedCount: number;
  unavailableCount: number;
  perSource: Partial<Record<Source, { raw: number; error?: string }>>;
  newListings: Array<{ id: string; title: string; price: number; neighborhood?: string; url: string }>;
}

export type ScrapeProgressHandler = (event: ScrapeProgressEvent) => void;

/** Direct sources that are complete enough to expire stale rows when they succeed. */
const SWEEPABLE_DIRECT_SOURCES = new Set<Source>([
  "craigslist",
  "kijiji",
  "zillow",
  "redfin",
  "realtor",
  "zumper",
]);

export async function runAllScrapers(
  ctx?: Partial<ScrapeContext>,
  options: { onProgress?: ScrapeProgressHandler } = {}
): Promise<ScrapeResult> {
  const envContext = contextFromEnv(ctx);
  const context: ScrapeContext = {
    ...envContext,
    ...ctx,
    city: cityFromParam(ctx?.city ?? envContext.city),
  };
  const scrapers = scrapersFor(context.city);

  const perSource = {} as ScrapeResult["perSource"];
  const allRaw: RawListing[] = [];
  const emit = options.onProgress ?? (() => {});

  emit({ type: "start", city: context.city, sourceCount: scrapers.length });

  // Run scrapers in parallel; each logs to scrape_runs.
  const results = await Promise.allSettled(
    scrapers.map(async (s) => {
      const start = Date.now();
      emit({ type: "source:start", city: context.city, source: s.source });
      const [run] = await db
        .insert(schema.scrapeRuns)
        .values({ source: s.source, city: context.city })
        .returning({ id: schema.scrapeRuns.id });
      try {
        const raw = await s.scrape(context);
        await db
          .update(schema.scrapeRuns)
          .set({ rawCount: raw.length, finishedAt: new Date() })
          .where(sql`${schema.scrapeRuns.id} = ${run.id}`);
        const ms = Date.now() - start;
        emit({ type: "source:done", city: context.city, source: s.source, raw: raw.length, ms });
        return { source: s.source, raw, ms };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .update(schema.scrapeRuns)
          .set({ error: msg, finishedAt: new Date() })
          .where(sql`${schema.scrapeRuns.id} = ${run.id}`);
        const ms = Date.now() - start;
        emit({ type: "source:error", city: context.city, source: s.source, error: msg, ms });
        return { source: s.source, raw: [] as RawListing[], error: msg, ms };
      }
    })
  );

  const sweepableSucceeded = new Set<Source>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { source, raw, error } = r.value;
    perSource[source] = { raw: raw.length, error };
    allRaw.push(...raw);
    if (!error && raw.length > 0 && SWEEPABLE_DIRECT_SOURCES.has(source)) sweepableSucceeded.add(source);
  }

  emit({ type: "ingest:start", city: context.city, raw: allRaw.length });
  const ingested = await ingestRawListings(db, allRaw, context, {
    geocodeBudget: Number(process.env.GEOCODE_BUDGET ?? 10),
    contactBudget: Number(process.env.CONTACT_EXTRACT_BUDGET ?? 15),
    sweepSources: sweepableSucceeded,
  });
  emit({
    type: "ingest:done",
    city: context.city,
    totalMerged: ingested.totalMerged,
    newCount: ingested.newCount,
    updatedCount: ingested.updatedCount,
    unavailableCount: ingested.unavailableCount,
  });

  const result = {
    totalRaw: allRaw.length,
    totalMerged: ingested.totalMerged,
    newCount: ingested.newCount,
    updatedCount: ingested.updatedCount,
    unavailableCount: ingested.unavailableCount,
    perSource,
    newListings: ingested.newListings,
  };
  emit({ type: "done", city: context.city, ...result });
  return result;
}
