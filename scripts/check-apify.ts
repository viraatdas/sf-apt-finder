import "dotenv/config";
import { checkApifyBalance } from "../lib/apify-balance";

async function main() {
  if (!process.env.APIFY_TOKEN) {
    console.error("APIFY_TOKEN env var required");
    process.exit(1);
  }
  const b = await checkApifyBalance();
  console.log(b);
}
main().catch(console.error);
