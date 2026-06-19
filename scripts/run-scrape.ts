/**
 * Manual scrape runner. Useful for first-time DB seeding.
 *   npx tsx scripts/run-scrape.ts
 */
import "dotenv/config";
import { contextFromEnv } from "../lib/cities";
import { runAllScrapers } from "../lib/scrapers";
import { formatScrapeProgress } from "../lib/scrapers/progress";
import { sendDailyDigest } from "../lib/email";

async function main() {
  const ctx = contextFromEnv();
  const result = await runAllScrapers(ctx, {
    onProgress: (event) => console.log(formatScrapeProgress(event)),
  });
  console.log(JSON.stringify(result, null, 2));

  if (process.argv.includes("--email")) {
    await sendDailyDigest(result, process.env.SITE_URL ?? "http://localhost:3000", ctx.city);
    console.log("Email sent.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
