import { cityFromParam, maxPriceFromParam } from "@/lib/cities";
import { schema } from "@/lib/db";
import { SourceStrip } from "@/components/source-strip";
import { sourceFromParam } from "@/lib/sources";
import { countMatchingListings, listAvailableListings, listDecisionMap, type DecisionValue } from "@/lib/listings/query";
import { currentUserId } from "@/lib/server-user";
import { MapPageClient } from "./client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<{ city?: string; maxPrice?: string; source?: string }>;
};

export default async function MapPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const city = cityFromParam(params.city);
  const maxPrice = maxPriceFromParam(city, params.maxPrice);
  const source = sourceFromParam(city, params.source);
  let listings: (typeof schema.listings.$inferSelect)[] = [];
  let decisionMap: Record<string, DecisionValue> = {};
  let matchingCount = 0;
  try {
    const filters = { city, maxPrice, source };
    const userId = await currentUserId();
    [matchingCount, listings, decisionMap] = await Promise.all([
      countMatchingListings(filters),
      listAvailableListings(filters, 500),
      listDecisionMap(userId),
    ]);
  } catch (err) {
    console.warn("DB read failed", err);
  }

  return (
    <>
      <SourceStrip
        city={city}
        matchingCount={matchingCount}
        maxPrice={maxPrice}
        activeSource={source}
        basePath="/map"
        className="pt-4"
      />
      <MapPageClient listings={listings} decisions={decisionMap} city={city} />
    </>
  );
}
