import { and, desc, eq, notInArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { SwipeDeck } from "@/components/swipe-deck";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  // Pull undecided, available listings for the default "household" user.
  let listings: typeof schema.listings.$inferSelect[] = [];
  try {
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
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
        <div className="text-5xl mb-4">🏚️</div>
        <h1 className="text-2xl font-display mb-2">No listings yet</h1>
        <p className="text-ink-900/60 max-w-md mb-4">
          The cron runs daily at 7:05 AM PT. To populate immediately, hit{" "}
          <code className="px-1.5 py-0.5 bg-ink-100 rounded text-sm">/api/cron</code>{" "}
          from your terminal with the <code>CRON_SECRET</code>.
        </p>
        <code className="text-xs bg-ink-100 px-3 py-2 rounded-lg">
          curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron
        </code>
      </div>
    );
  }

  return <SwipeDeck initial={listings} />;
}
