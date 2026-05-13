/**
 * Manual scrape runner. Useful for first-time DB seeding.
 *   npx tsx scripts/run-scrape.ts
 */
import "dotenv/config";
import { runAllScrapers } from "../lib/scrapers";
import { sendDailyDigest } from "../lib/email";

async function main() {
  console.log("Starting scrape...");
  const result = await runAllScrapers();
  console.log(JSON.stringify(result, null, 2));

  if (process.argv.includes("--email")) {
    await sendDailyDigest(result, process.env.SITE_URL ?? "http://localhost:3000");
    console.log("Email sent.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
