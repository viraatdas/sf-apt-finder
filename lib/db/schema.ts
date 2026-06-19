import {
  pgTable,
  text,
  integer,
  doublePrecision,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  serial,
  pgEnum,
} from "drizzle-orm/pg-core";

export const decisionEnum = pgEnum("decision", ["yes", "no", "maybe"]);
export const statusEnum = pgEnum("listing_status", ["available", "unavailable"]);

/** A canonical listing, deduped across sources. */
export const listings = pgTable(
  "listings",
  {
    id: text("id").primaryKey(), // stable hash: street+zip+beds+sqft
    city: text("city").notNull().default("san-francisco"),
    title: text("title").notNull(),
    addressLine: text("address_line"),
    neighborhood: text("neighborhood"),
    zip: text("zip"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    bedrooms: integer("bedrooms"),
    bathrooms: doublePrecision("bathrooms"),
    sqft: integer("sqft"),
    /** Lowest seen price across sources, in dollars per month. */
    price: integer("price"),
    /** All prices seen across sources, keyed by source. */
    pricesBySource: jsonb("prices_by_source").$type<Record<string, number>>(),
    description: text("description"),
    photoUrls: jsonb("photo_urls").$type<string[]>().default([]),
    /** All source URLs that point at this listing. */
    sources: jsonb("sources")
      .$type<Array<{ source: string; url: string; sourceId: string; scrapedAt: string }>>()
      .default([]),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when we observe a listing missing from sources where it was previously seen. */
    unavailableAt: timestamp("unavailable_at", { withTimezone: true }),
    status: statusEnum("status").notNull().default("available"),
    /** Contact info, when extractable from the listing description / detail page. */
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    contactName: text("contact_name"),
    /** Tracks whether we've already tried to extract contact info, so we don't re-LLM. */
    contactExtractedAt: timestamp("contact_extracted_at", { withTimezone: true }),
    raw: jsonb("raw"),
  },
  (t) => ({
    byNeighborhood: index("listings_neighborhood_idx").on(t.neighborhood),
    byCity: index("listings_city_idx").on(t.city),
    byPrice: index("listings_price_idx").on(t.price),
    byLastSeen: index("listings_last_seen_idx").on(t.lastSeenAt),
    byStatus: index("listings_status_idx").on(t.status),
  })
);

/** Per-user swipe decision. */
export const decisions = pgTable(
  "decisions",
  {
    id: serial("id").primaryKey(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    decision: decisionEnum("decision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneDecisionPerUserPerListing: uniqueIndex("decisions_unique_user_listing").on(
      t.userId,
      t.listingId
    ),
  })
);

/** Audit log of scrape runs. */
export const scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  city: text("city").notNull().default("san-francisco"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  source: text("source").notNull(),
  rawCount: integer("raw_count").default(0),
  newCount: integer("new_count").default(0),
  updatedCount: integer("updated_count").default(0),
  error: text("error"),
});

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type Decision = typeof decisions.$inferSelect;
