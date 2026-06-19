/**
 * Browser-based scrape runner. Uses Playwright + stealth (residential or
 * GitHub Actions runner IP), writes the same shape into the same DB as the
 * lightweight Vercel scrapers. Designed for daily GitHub Actions cron.
 *
 *   npx tsx scripts/scrape-browser.ts          # all
 *   npx tsx scripts/scrape-browser.ts hotpads  # one source
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { CITIES, contextFromEnv, type CityId } from "../lib/cities";
import * as schema from "../lib/db/schema";
import type { Source } from "../lib/scrapers/types";
import { filterRawListings, ingestRawListings, type ScrapeDatabase } from "../lib/scrapers/ingest";
import { runBrowserScrapers, type BrowserScraper } from "../lib/scrapers/browser";
import { hotpads } from "../lib/scrapers/browser/hotpads";
import { apartmentsCom } from "../lib/scrapers/browser/apartments-com";
import { padmapper } from "../lib/scrapers/browser/padmapper";
import { trulia } from "../lib/scrapers/browser/trulia";
import { zillow } from "../lib/scrapers/browser/zillow";
import { livrent } from "../lib/scrapers/browser/livrent";
import { rentalsCa } from "../lib/scrapers/browser/rentals-ca";
import { sendDailyDigest } from "../lib/email";

const ALL: BrowserScraper[] = [zillow, trulia, hotpads, apartmentsCom, padmapper, livrent, rentalsCa];
const SWEEPABLE_BROWSER_SOURCES = new Set<Source>([
  "zillow",
  "trulia",
  "hotpads",
  "apartments-com",
  "padmapper",
  "livrent",
  "rentals-ca",
]);

function browserScrapersFor(city: CityId): BrowserScraper[] {
  const configured = new Set(CITIES[city].sources);
  return ALL.filter((scraper) => configured.has(scraper.source));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = postgres(url, { prepare: false, max: 3 });
  const db = drizzle(client, { schema });

  const ctx = contextFromEnv();

  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const only = args[0];
  const cityScrapers = browserScrapersFor(ctx.city);
  const scrapers = only ? cityScrapers.filter((s) => s.source === only) : cityScrapers;
  if (!scrapers.length) {
    console.error("No scrapers selected. Known sources:", cityScrapers.map((s) => s.source).join(", "));
    process.exit(1);
  }
  console.log(
    `Running ${scrapers.length} browser scraper(s) for ${ctx.city}:`,
    scrapers.map((s) => s.source).join(", ")
  );

  const results = await runBrowserScrapers(scrapers, ctx);

  const allRaw = Object.values(results).flatMap((v) => v.raw);
  console.log(`\nTotal raw: ${allRaw.length}`);
  for (const [src, { raw, error }] of Object.entries(results)) {
    console.log(`  ${src.padEnd(16)} raw=${raw.length}${error ? ` err=${error}` : ""}`);
  }

  const filtered = filterRawListings(allRaw, ctx);

  // Audit
  for (const src of Object.keys(results)) {
    const r = results[src as keyof typeof results];
    await db.insert(schema.scrapeRuns).values({
      source: src,
      city: ctx.city,
      rawCount: r.raw.length,
      error: r.error ?? null,
      finishedAt: new Date(),
    });
  }

  const sweepSources = Object.entries(results)
    .filter(([source, result]) => !result.error && result.raw.length > 0 && SWEEPABLE_BROWSER_SOURCES.has(source as Source))
    .map(([source]) => source as Source);
  const ingested = await ingestRawListings(db as ScrapeDatabase, allRaw, ctx, {
    sweepSources,
  });
  console.log(`Filtered: ${filtered.length}, merged: ${ingested.totalMerged}`);

  console.log(`\n✔ new=${ingested.newCount} updated=${ingested.updatedCount} unavailable=${ingested.unavailableCount}`);

  // Email digest (controlled by --email flag or EMAIL_DIGEST=1 env)
  if (process.argv.includes("--email") || process.env.EMAIL_DIGEST === "1") {
    if (ingested.newCount > 0) {
      // Build a ScrapeResult-shaped object the existing email composer expects
      const perSource: Record<string, { raw: number; error?: string }> = {};
      for (const [s, v] of Object.entries(results)) perSource[s] = { raw: v.raw.length, error: v.error };
      await sendDailyDigest(
        {
          totalRaw: allRaw.length,
          totalMerged: ingested.totalMerged,
          newCount: ingested.newCount,
          updatedCount: ingested.updatedCount,
          unavailableCount: ingested.unavailableCount,
          perSource: perSource as any,
          newListings: ingested.newListings,
        },
        process.env.SITE_URL ?? "https://apt-tinder.viraat.dev",
        ctx.city
      );
      console.log("✔ email sent");
    } else {
      console.log("ℹ no new listings - skipping email");
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
