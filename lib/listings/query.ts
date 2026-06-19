import { and, desc, eq, lte, notInArray, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CityId } from "@/lib/cities";
import type { Source } from "@/lib/scrapers/types";

export type ListingFilters = {
  city: CityId;
  maxPrice: number;
  source?: Source | null;
  includeUnavailable?: boolean;
};

export type DecisionValue = "yes" | "no" | "maybe";

export type LikedListingRow = {
  listing: typeof schema.listings.$inferSelect;
  decision: DecisionValue;
  decidedAt: Date;
};

export function hasSource(source: Source | null | undefined): SQL | undefined {
  if (!source) return undefined;
  return sql`exists (
    select 1
    from jsonb_array_elements(${schema.listings.sources}) item
    where item->>'source' = ${source}
  )`;
}

export function hasAnySource(sources: Iterable<Source>): SQL | undefined {
  const sourceList = Array.from(new Set(sources));
  if (sourceList.length === 0) return undefined;
  return sql`exists (
    select 1
    from jsonb_array_elements(${schema.listings.sources}) item
    where item->>'source' in (${sql.join(sourceList.map((source) => sql`${source}`), sql`, `)})
  )`;
}

export function listingWhere(filters: ListingFilters, ...extra: Array<SQL | undefined>) {
  return and(
    filters.includeUnavailable ? undefined : eq(schema.listings.status, "available"),
    eq(schema.listings.city, filters.city),
    lte(schema.listings.price, filters.maxPrice),
    hasSource(filters.source),
    ...extra
  );
}

export async function countMatchingListings(filters: ListingFilters): Promise<number> {
  const [matching] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.listings)
    .where(listingWhere(filters));
  return matching?.count ?? 0;
}

export async function listAvailableListings(filters: ListingFilters, limit: number) {
  return db
    .select()
    .from(schema.listings)
    .where(listingWhere(filters))
    .orderBy(desc(schema.listings.firstSeenAt))
    .limit(limit);
}

export async function listSwipeListings(
  filters: ListingFilters,
  userId: string | null,
  limit: number
) {
  const decidedIds = userId ? await decisionListingIds(userId) : [];
  return db
    .select()
    .from(schema.listings)
    .where(
      listingWhere(
        filters,
        decidedIds.length ? notInArray(schema.listings.id, decidedIds) : undefined
      )
    )
    .orderBy(desc(schema.listings.firstSeenAt))
    .limit(limit);
}

export async function listDecisionMap(userId: string | null): Promise<Record<string, DecisionValue>> {
  if (!userId) return {};
  const rows = await db
    .select({ listingId: schema.decisions.listingId, decision: schema.decisions.decision })
    .from(schema.decisions)
    .where(eq(schema.decisions.userId, userId));
  return Object.fromEntries(rows.map((row) => [row.listingId, row.decision as DecisionValue]));
}

export async function listLikedListings(
  filters: ListingFilters,
  userId: string | null,
  limit?: number
): Promise<LikedListingRow[]> {
  if (!userId) return [];
  const query = db
    .select({
      listing: schema.listings,
      decision: schema.decisions.decision,
      decidedAt: schema.decisions.createdAt,
    })
    .from(schema.decisions)
    .innerJoin(schema.listings, eq(schema.decisions.listingId, schema.listings.id))
    .where(
      and(
        eq(schema.decisions.userId, userId),
        listingWhere(filters)
      )
    )
    .orderBy(desc(schema.decisions.createdAt));

  const rows = limit == null ? await query : await query.limit(limit);
  return rows.map((row) => ({
    listing: row.listing,
    decision: row.decision as DecisionValue,
    decidedAt: row.decidedAt,
  }));
}

async function decisionListingIds(userId: string): Promise<string[]> {
  const decided = await db
    .select({ id: schema.decisions.listingId })
    .from(schema.decisions)
    .where(eq(schema.decisions.userId, userId));
  return decided.map((decision) => decision.id);
}
