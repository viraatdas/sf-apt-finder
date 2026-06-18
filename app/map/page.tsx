import { and, desc, eq, lte } from "drizzle-orm";
import { cityFromParam, maxPriceFromParam } from "@/lib/cities";
import { db, schema } from "@/lib/db";
import { SourceStrip } from "@/components/source-strip";
import { MapPageClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<{ city?: string; maxPrice?: string }>;
};

export default async function MapPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const city = cityFromParam(params.city);
  const maxPrice = maxPriceFromParam(city, params.maxPrice);
  let listings: (typeof schema.listings.$inferSelect)[] = [];
  let decisions: { listingId: string; decision: "yes" | "no" | "maybe" }[] = [];
  try {
    listings = await db
      .select()
      .from(schema.listings)
      .where(
        and(
          eq(schema.listings.status, "available"),
          eq(schema.listings.city, city),
          lte(schema.listings.price, maxPrice)
        )
      )
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
  return (
    <>
      <SourceStrip city={city} className="pt-4" />
      <MapPageClient listings={listings} decisions={decisionMap} city={city} />
    </>
  );
}
