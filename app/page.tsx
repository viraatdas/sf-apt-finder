import type { Metadata } from "next";
import { CITIES, cityFromParam, maxPriceFromParam } from "@/lib/cities";
import { schema } from "@/lib/db";
import { SwipeDeck } from "@/components/swipe-deck";
import { SourceStrip } from "@/components/source-strip";
import { sourceFromParam, sourceListLabel } from "@/lib/sources";
import { formatMoney } from "@/lib/utils";
import { countMatchingListings, listSwipeListings } from "@/lib/listings/query";
import { currentUserId } from "@/lib/server-user";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<{ city?: string; maxPrice?: string; source?: string }>;
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
  const source = sourceFromParam(city, params.source);
  let listings: typeof schema.listings.$inferSelect[] = [];
  let matchingCount = 0;
  try {
    const filters = { city, maxPrice, source };
    const userId = await currentUserId();
    [matchingCount, listings] = await Promise.all([
      countMatchingListings(filters),
      listSwipeListings(filters, userId, 100),
    ]);
  } catch (err) {
    console.warn("DB read failed (probably not set up yet)", err);
  }

  if (listings.length === 0) {
    return (
      <>
        <SourceStrip
          city={city}
          matchingCount={matchingCount}
          maxPrice={maxPrice}
          activeSource={source}
          basePath="/"
          className="pt-4"
        />
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
            curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; https://your-domain/api/cron
          </code>
        </div>
      </>
    );
  }

  return (
    <>
      <SourceStrip
        city={city}
        matchingCount={matchingCount}
        maxPrice={maxPrice}
        activeSource={source}
        basePath="/"
        className="pt-4"
      />
      <SwipeDeck initial={listings} city={city} />
    </>
  );
}
