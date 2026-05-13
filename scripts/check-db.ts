import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  console.log("=== Top 8 listings ordered by first_seen DESC (what swipe deck shows) ===");
  const rows = await sql`
    SELECT id, title, neighborhood, price,
      jsonb_array_length(coalesce(photo_urls,'[]'::jsonb)) AS photos,
      photo_urls->0 AS first_photo,
      first_seen_at, status
    FROM listings
    WHERE status='available'
      AND id NOT IN (SELECT listing_id FROM decisions WHERE user_id='household')
    ORDER BY first_seen_at DESC LIMIT 8`;
  for (const r of rows) {
    console.log(`  $${r.price} ${r.neighborhood ?? "—"}  photos:${r.photos}  ${r.id}`);
    if (r.first_photo) console.log(`     ${r.first_photo}`);
  }

  await sql.end();
}
main().catch(console.error);
