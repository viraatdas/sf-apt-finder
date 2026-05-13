import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const r = await sql`
    SELECT (photo_urls->>0) AS p, id
    FROM listings
    WHERE jsonb_array_length(coalesce(photo_urls,'[]'::jsonb)) > 0
    LIMIT 1`;
  console.log("photo url:", r[0]?.p);
  await sql.end();
}
main().catch(console.error);
