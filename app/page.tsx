import { and, desc, eq, lte, notInArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { CITIES, cityFromParam, maxPriceFromParam } from "@/lib/cities";
import { db, schema } from "@/lib/db";
import { SwipeDeck } from "@/components/swipe-deck";
import { SourceStrip } from "@/components/source-strip";
import { sourceListLabel } from "@/lib/sources";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<{ city?: string; maxPrice?: string }>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const city = cityFromParam((await searchParams).city);
  return {
    title: `${CITIES[city].name} apartments`,
    description: `Swipe through ${CITIES[city].name} rentals from ${sourceListLabel(city)} in apt-tinder.`,
  };
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const city = cityFromParam(params.city);
  const maxPrice = maxPriceFromParam(city, params.maxPrice);
  // Pull undecided, available listings for the default "household" user.
  let listings: typeof schema.listings.$inferSelect[] = [];
  let matchingCount = 0;
  try {
    const [matching] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.listings)
      .where(
        and(
          eq(schema.listings.status, "available"),
          eq(schema.listings.city, city),
          lte(schema.listings.price, maxPrice)
        )
      );
    matchingCount = matching?.count ?? 0;

    const decided = await db
      .select({ id: schema.decisions.listingId })
      .from(schema.decisions)
      .where(eq(schema.decisions.userId, "household"));
    const decidedIds = decided.map((d) => d.id);

    listings = await db
      .select()
      .from(schema.listings)
      .where(
        and(
          eq(schema.listings.status, "available"),
          eq(schema.listings.city, city),
          lte(schema.listings.price, maxPrice),
          decidedIds.length ? notInArray(schema.listings.id, decidedIds) : undefined
        )
      )
      .orderBy(desc(schema.listings.firstSeenAt))
      .limit(100);
  } catch (err) {
    console.warn("DB read failed (probably not set up yet)", err);
  }

  if (listings.length === 0) {
    return (
      <>
        <SourceStrip city={city} matchingCount={matchingCount} maxPrice={maxPrice} className="pt-4" />
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
          <div className="text-5xl mb-4">🏚️</div>
          <h1 className="text-2xl font-display mb-2">No listings yet</h1>
          <p className="text-ink-900/60 max-w-md mb-4">
            No {CITIES[city].name} listings under {formatMoney(maxPrice, city)} are available yet.
            The cron runs daily at 7:05 AM PT. To populate immediately, hit{" "}
            <code className="px-1.5 py-0.5 bg-ink-100 rounded text-sm">/api/cron</code>{" "}
            from your terminal with the <code>CRON_SECRET</code>.
          </p>
          <code className="text-xs bg-ink-100 px-3 py-2 rounded-lg">
            curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron
          </code>
        </div>
      </>
    );
  }

  return (
    <>
      <SourceStrip city={city} matchingCount={matchingCount} maxPrice={maxPrice} className="pt-4" />
      <SwipeDeck initial={listings} city={city} />
    </>
  );
}
