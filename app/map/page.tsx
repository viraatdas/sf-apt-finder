import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { MapPageClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MapPage() {
  let listings: (typeof schema.listings.$inferSelect)[] = [];
  let decisions: { listingId: string; decision: "yes" | "no" | "maybe" }[] = [];
  try {
    listings = await db
      .select()
      .from(schema.listings)
      .where(eq(schema.listings.status, "available"))
      .orderBy(desc(schema.listings.firstSeenAt))
      .limit(500);
    decisions = (await db
      .select({ listingId: schema.decisions.listingId, decision: schema.decisions.decision })
      .from(schema.decisions)
      .where(eq(schema.decisions.userId, "household"))) as any;
  } catch (err) {
    console.warn("DB read failed", err);
  }

  const decisionMap: Record<string, "yes" | "no" | "maybe"> = {};
  for (const d of decisions) decisionMap[d.listingId] = d.decision;
  return <MapPageClient listings={listings} decisions={decisionMap} />;
}
