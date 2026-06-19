/**
 * One-shot reset: clear test swipes + trim audit log.
 * Listings table is intentionally preserved. Tomorrow's cron refreshes it.
 */
import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  const [{ count: dBefore }] = await sql`SELECT count(*)::int AS count FROM decisions`;
  const [{ count: sBefore }] = await sql`SELECT count(*)::int AS count FROM scrape_runs`;
  const [{ count: lTotal }] = await sql`SELECT count(*)::int AS count FROM listings`;

  console.log("before:");
  console.log("  decisions:", dBefore, "scrape_runs:", sBefore, "listings:", lTotal);

  await sql`TRUNCATE decisions RESTART IDENTITY CASCADE`;
  await sql`DELETE FROM scrape_runs WHERE started_at < NOW() - INTERVAL '6 hours'`;

  const [{ count: dAfter }] = await sql`SELECT count(*)::int AS count FROM decisions`;
  const [{ count: sAfter }] = await sql`SELECT count(*)::int AS count FROM scrape_runs`;
  const statusCounts = await sql`SELECT status, count(*)::int AS count FROM listings GROUP BY 1`;

  console.log("\nafter:");
  console.log("  decisions:", dAfter, "scrape_runs:", sAfter);
  for (const r of statusCounts) console.log(`  listings status=${r.status}: ${r.count}`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
