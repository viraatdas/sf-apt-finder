import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "household";
  const mode = url.searchParams.get("mode") ?? "swipe"; // swipe | liked | all
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
      .where(eq(schema.decisions.userId, userId))
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
    decidedIds.length ? notInArray(schema.listings.id, decidedIds) : undefined,
    mode === "swipe" ? sql`${schema.listings.price} <= 9000` : undefined
  );

  const rows = await db
    .select()
    .from(schema.listings)
    .where(where)
    .orderBy(desc(schema.listings.firstSeenAt))
    .limit(limit);

  return NextResponse.json({ listings: rows });
}
