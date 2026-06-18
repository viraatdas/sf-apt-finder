ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "city" text NOT NULL DEFAULT 'san-francisco';

ALTER TABLE "scrape_runs"
  ADD COLUMN IF NOT EXISTS "city" text NOT NULL DEFAULT 'san-francisco';

CREATE INDEX IF NOT EXISTS "listings_city_idx" ON "listings" ("city");

UPDATE "listings" SET "city" = 'san-francisco' WHERE "city" IS NULL;
UPDATE "scrape_runs" SET "city" = 'san-francisco' WHERE "city" IS NULL;
