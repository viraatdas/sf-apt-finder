import { config } from "dotenv";
config({ path: ".env.local" });
config();
import postgres from "postgres";
import { upgradePhotoUrl } from "../lib/utils";

/**
 * One-time backfill: rewrite stored photo_urls to their high-res variants using
 * the same upgradePhotoUrl() the UI uses, so the canonical data matches what we
 * render. Safe to re-run (idempotent — already-upgraded URLs are unchanged).
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  const rows = await sql<{ id: string; photo_urls: string[] | null }[]>`
    SELECT id, photo_urls
    FROM listings
    WHERE jsonb_array_length(coalesce(photo_urls, '[]'::jsonb)) > 0`;

  let changed = 0;
  let urlsChanged = 0;
  for (const row of rows) {
    const photos = row.photo_urls ?? [];
    const upgraded = photos.map((u) => upgradePhotoUrl(u));
    const diffs = upgraded.filter((u, i) => u !== photos[i]).length;
    if (diffs === 0) continue;
    changed++;
    urlsChanged += diffs;
    if (!dryRun) {
      await sql`UPDATE listings SET photo_urls = ${sql.json(upgraded)} WHERE id = ${row.id}`;
    }
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}${rows.length} listings with photos · ` +
      `${changed} listings updated · ${urlsChanged} URLs upgraded`
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
