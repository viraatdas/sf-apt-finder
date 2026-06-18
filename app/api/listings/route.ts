import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, lte, notInArray } from "drizzle-orm";
import { cityFromParam, maxPriceFromParam } from "@/lib/cities";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "household";
  const mode = url.searchParams.get("mode") ?? "swipe"; // swipe | liked | all
  const city = cityFromParam(url.searchParams.get("city"));
  const maxPrice = maxPriceFromParam(city, url.searchParams.get("maxPrice"));
  const includeUnavailable = url.searchParams.get("includeUnavailable") === "1";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);

  if (mode === "liked") {
    const rows = await db
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
          eq(schema.listings.city, city),
          lte(schema.listings.price, maxPrice)
        )
      )
      .orderBy(desc(schema.decisions.createdAt))
      .limit(limit);
    return NextResponse.json({ listings: rows });
  }

  // For swipe mode: exclude already-decided listings for this user
  const decided = await db
    .select({ id: schema.decisions.listingId })
    .from(schema.decisions)
    .where(eq(schema.decisions.userId, userId));
  const decidedIds = decided.map((d) => d.id);

  const where = and(
    includeUnavailable ? undefined : eq(schema.listings.status, "available"),
    eq(schema.listings.city, city),
    decidedIds.length ? notInArray(schema.listings.id, decidedIds) : undefined,
    lte(schema.listings.price, maxPrice)
  );

  const rows = await db
    .select()
    .from(schema.listings)
    .where(where)
    .orderBy(desc(schema.listings.firstSeenAt))
    .limit(limit);

  return NextResponse.json({ listings: rows });
}
