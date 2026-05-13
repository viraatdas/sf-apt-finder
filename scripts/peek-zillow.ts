import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const r = await sql`
    SELECT raw FROM listings
    WHERE (sources->0->>'source')='zillow' AND raw IS NOT NULL
    ORDER BY first_seen_at DESC LIMIT 1`;
  // raw is { zillow: { ... } } because the merger keys by source.
  const raw = ((r[0]?.raw as any)?.zillow as any) ?? {};
  console.log("zillow keys:", Object.keys(raw).sort());
  for (const k of ["listing", "rental", "attributionInfo", "listingProvider", "hdpData", "personalizedResult", "hdpView"]) {
    if (raw[k]) {
      console.log(`\n=== ${k} ===`);
      console.log(JSON.stringify(raw[k], null, 2).slice(0, 1500));
    }
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
