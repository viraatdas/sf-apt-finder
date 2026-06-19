import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { extractContact } from "@/lib/contact";
import { db, schema } from "@/lib/db";
import { mergeRaw } from "@/lib/dedup";
import { geocode } from "@/lib/geocode";
import { hasAnySource } from "@/lib/listings/query";
import { approximateLocationFor, neighborhoodFor } from "@/lib/neighborhoods";
import type { MergedListing } from "@/lib/dedup";
import type { RawListing, ScrapeContext, Source } from "@/lib/scrapers/types";

export type ScrapeDatabase = typeof db;

export type IngestedListing = {
  id: string;
  title: string;
  price: number;
  neighborhood?: string;
  url: string;
};

export type IngestResult = {
  totalMerged: number;
  newCount: number;
  updatedCount: number;
  unavailableCount: number;
  newListings: IngestedListing[];
};

type IngestOptions = {
  geocodeBudget?: number;
  contactBudget?: number;
  sweepSources?: Iterable<Source>;
  unavailableAfterMs?: number;
};

const DEFAULT_UNAVAILABLE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export function filterRawListings(raw: RawListing[], context: ScrapeContext): RawListing[] {
  return raw.filter((listing) => {
    if (listing.price > context.maxPrice) return false;
    if (context.bedrooms != null && listing.bedrooms != null && listing.bedrooms < context.bedrooms) {
      return false;
    }
    if (context.bedrooms != null && listing.bedrooms != null && listing.bedrooms > context.bedrooms + 2) {
      return false;
    }
    return true;
  });
}

export async function ingestRawListings(
  database: ScrapeDatabase,
  raw: RawListing[],
  context: ScrapeContext,
  options: IngestOptions = {}
): Promise<IngestResult> {
  const filtered = filterRawListings(raw, context);
  const merged = mergeRaw(filtered, context.city);

  if (options.geocodeBudget && options.geocodeBudget > 0) {
    await geocodeMissingCoordinates(merged, context, options.geocodeBudget);
  }

  const upserted = await upsertMergedListings(database, merged, context);

  if (options.contactBudget && options.contactBudget > 0 && process.env.ANTHROPIC_API_KEY) {
    await extractContactsForNewListings(database, upserted.newListings, options.contactBudget);
  }

  const unavailableCount = await sweepUnavailableListings(database, context, {
    sources: options.sweepSources ?? [],
    unavailableAfterMs: options.unavailableAfterMs ?? DEFAULT_UNAVAILABLE_AFTER_MS,
  });

  return {
    totalMerged: merged.length,
    newCount: upserted.newCount,
    updatedCount: upserted.updatedCount,
    unavailableCount,
    newListings: upserted.newListings,
  };
}

async function geocodeMissingCoordinates(
  listings: MergedListing[],
  context: ScrapeContext,
  geocodeBudget: number
) {
  let geocoded = 0;
  for (const listing of listings) {
    if ((listing.lat != null && listing.lng != null) || !listing.addressLine) continue;
    const approximate = approximateLocationFor(listing.addressLine, context.city);
    if (approximate) {
      listing.lat = approximate.lat;
      listing.lng = approximate.lng;
      continue;
    }
    if (geocoded >= geocodeBudget) break;
    const result = await geocode(listing.addressLine, context.city);
    if (!result) continue;
    listing.lat = result.lat;
    listing.lng = result.lng;
    geocoded++;
  }
}

async function upsertMergedListings(
  database: ScrapeDatabase,
  listings: MergedListing[],
  context: ScrapeContext
) {
  let newCount = 0;
  let updatedCount = 0;
  const newListings: IngestedListing[] = [];

  for (const listing of listings) {
    const neighborhood = neighborhoodFor(listing.lat, listing.lng, context.city);
    const values = {
      id: listing.id,
      city: context.city,
      title: listing.title.slice(0, 500),
      addressLine: listing.addressLine ?? null,
      neighborhood: neighborhood ?? null,
      zip: listing.zip ?? null,
      lat: listing.lat ?? null,
      lng: listing.lng ?? null,
      bedrooms: listing.bedrooms ?? null,
      bathrooms: listing.bathrooms ?? null,
      sqft: listing.sqft ?? null,
      price: listing.price,
      pricesBySource: listing.pricesBySource,
      description: listing.description ?? null,
      photoUrls: listing.photoUrls ?? [],
      sources: listing.sources,
      raw: listing.raw,
      lastSeenAt: new Date(),
    };

    const result = await database
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

    if (!result[0]) continue;
    const isNew = new Date(result[0].firstSeenAt).getTime() > Date.now() - 60_000;
    if (isNew) {
      newCount++;
      newListings.push({
        id: listing.id,
        title: listing.title,
        price: listing.price,
        neighborhood,
        url: listing.sources[0]?.url ?? "",
      });
    } else {
      updatedCount++;
    }
  }

  return { newCount, updatedCount, newListings };
}

async function extractContactsForNewListings(
  database: ScrapeDatabase,
  newListings: IngestedListing[],
  contactBudget: number
) {
  const newIds = newListings.slice(0, contactBudget).map((listing) => listing.id);
  if (newIds.length === 0) return;

  const rows = await database
    .select({ id: schema.listings.id, description: schema.listings.description })
    .from(schema.listings)
    .where(and(inArray(schema.listings.id, newIds), isNull(schema.listings.contactExtractedAt)));

  let extracted = 0;
  for (const row of rows) {
    if (!row.description) continue;
    const contact = await extractContact(row.description);
    const hasAny = !!(contact.phone || contact.email || contact.name);
    await database
      .update(schema.listings)
      .set({
        contactPhone: contact.phone ?? null,
        contactEmail: contact.email ?? null,
        contactName: contact.name ?? null,
        contactExtractedAt: new Date(),
      })
      .where(eq(schema.listings.id, row.id));
    if (hasAny) extracted++;
  }
  console.log(`contact extraction: ${extracted}/${rows.length} found contact info`);
}

async function sweepUnavailableListings(
  database: ScrapeDatabase,
  context: ScrapeContext,
  options: { sources: Iterable<Source>; unavailableAfterMs: number }
): Promise<number> {
  const sourceCondition = hasAnySource(options.sources);
  if (!sourceCondition) return 0;

  const cutoff = new Date(Date.now() - options.unavailableAfterMs);
  const swept = await database
    .update(schema.listings)
    .set({ status: "unavailable", unavailableAt: new Date() })
    .where(
      and(
        eq(schema.listings.status, "available"),
        eq(schema.listings.city, context.city),
        lt(schema.listings.lastSeenAt, cutoff),
        sourceCondition
      )
    )
    .returning({ id: schema.listings.id });

  return swept.length;
}
