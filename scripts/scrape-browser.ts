/**
 * Browser-based scrape runner. Uses Playwright + stealth (residential or
 * GitHub Actions runner IP), writes the same shape into the same DB as the
 * lightweight Vercel scrapers. Designed for daily GitHub Actions cron.
 *
 *   npx tsx scripts/scrape-browser.ts          # all
 *   npx tsx scripts/scrape-browser.ts hotpads  # one source
 */
import "dotenv/config";
import { sql, and, eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { CITIES, contextFromEnv, type CityId } from "../lib/cities";
import * as schema from "../lib/db/schema";
import { mergeRaw } from "../lib/dedup";
import { neighborhoodFor } from "../lib/neighborhoods";
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

  // Filter to bedroom/price constraints
  const filtered = allRaw.filter((r) => {
    if (r.price > ctx.maxPrice) return false;
    if (ctx.bedrooms != null && r.bedrooms != null && r.bedrooms < ctx.bedrooms) return false;
    if (ctx.bedrooms != null && r.bedrooms != null && r.bedrooms > ctx.bedrooms + 2) return false;
    return true;
  });
  const merged = mergeRaw(filtered, ctx.city);
  console.log(`Filtered: ${filtered.length}, merged: ${merged.length}`);

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

  let newCount = 0;
  let updatedCount = 0;
  const newListings: Array<{ id: string; title: string; price: number; neighborhood?: string; url: string }> = [];

  for (const m of merged) {
    const neighborhood = neighborhoodFor(m.lat, m.lng, ctx.city);
    const values = {
      id: m.id,
      city: ctx.city,
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
          city: values.city,
          lastSeenAt: new Date(),
          price: sql`LEAST(${schema.listings.price}, EXCLUDED.price)`,
          pricesBySource: values.pricesBySource,
          sources: values.sources,
          photoUrls: values.photoUrls,
          neighborhood: values.neighborhood,
          lat: values.lat,
          lng: values.lng,
          status: "available",
          unavailableAt: null,
        },
      })
      .returning({ id: schema.listings.id, firstSeenAt: schema.listings.firstSeenAt });
    if (result[0]) {
      const isNew = new Date(result[0].firstSeenAt).getTime() > Date.now() - 60_000;
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

  // Availability sweep — only if at least one source succeeded.
  const anySucceeded = Object.values(results).some((r) => !r.error && r.raw.length > 0);
  let unavailableCount = 0;
  if (anySucceeded) {
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const swept = await db
      .update(schema.listings)
      .set({ status: "unavailable", unavailableAt: new Date() })
      .where(
        and(
          eq(schema.listings.status, "available"),
          eq(schema.listings.city, ctx.city),
          lt(schema.listings.lastSeenAt, cutoff)
        )
      )
      .returning({ id: schema.listings.id });
    unavailableCount = swept.length;
  }

  console.log(`\n✔ new=${newCount} updated=${updatedCount} unavailable=${unavailableCount}`);

  // Email digest (controlled by --email flag or EMAIL_DIGEST=1 env)
  if (process.argv.includes("--email") || process.env.EMAIL_DIGEST === "1") {
    if (newCount > 0) {
      // Build a ScrapeResult-shaped object the existing email composer expects
      const perSource: Record<string, { raw: number; error?: string }> = {};
      for (const [s, v] of Object.entries(results)) perSource[s] = { raw: v.raw.length, error: v.error };
      await sendDailyDigest(
        {
          totalRaw: allRaw.length,
          totalMerged: merged.length,
          newCount,
          updatedCount,
          unavailableCount,
          perSource: perSource as any,
          newListings,
        },
        process.env.SITE_URL ?? "https://apt-tinder.viraat.dev",
        ctx.city
      );
      console.log("✔ email sent");
    } else {
      console.log("ℹ no new listings — skipping email");
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
