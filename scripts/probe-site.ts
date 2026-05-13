/**
 * Probe a single site: wait, dump DOM hints, intercept network for JSON APIs.
 * Usage: npx tsx scripts/probe-site.ts <name>
 */
import { chromium as chromiumExtra } from "playwright-extra";
// @ts-ignore
import stealth from "puppeteer-extra-plugin-stealth";

chromiumExtra.use(stealth());

const SITES: Record<string, string> = {
  zumper: "https://www.zumper.com/apartments-for-rent/san-francisco-ca/3-bedrooms?max_price=9000",
  padmapper: "https://www.padmapper.com/apartments/san-francisco-ca/3-bedrooms-under-9000",
  apartments: "https://www.apartments.com/san-francisco-ca/3-bedrooms-under-9000/",
  trulia: "https://www.trulia.com/for_rent/San_Francisco,CA/3p_beds/0-9000_price/",
  realtor: "https://www.realtor.com/apartments/San-Francisco_CA/beds-3/price-na-9000",
  hotpads: "https://hotpads.com/san-francisco-ca/apartments-for-rent?beds=3-&maxRent=9000",
};

async function main() {
  const name = process.argv[2] || "zumper";
  const url = SITES[name];
  if (!url) {
    console.error("unknown site:", name, "(known:", Object.keys(SITES).join(","), ")");
    return;
  }

  const browser = await chromiumExtra.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  const apiHits: { url: string; len: number; type: string }[] = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (u.includes("/api/") || u.includes("/graphql") || u.endsWith(".json")) {
      try {
        const len = parseInt(res.headers()["content-length"] ?? "0", 10);
        const type = res.headers()["content-type"] ?? "";
        if (len > 1000 || (!len && type.includes("json"))) {
          apiHits.push({ url: u, len, type });
        }
      } catch {}
    }
  });

  console.log("→", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(7000);

  const title = await page.title();
  console.log("title:", title);

  const text = (await page.locator("body").innerText()).slice(0, 400);
  console.log("body preview:", text.replace(/\n/g, " | ").slice(0, 200));

  // Find common selectors via heuristics
  const counts = await page.evaluate(() => ({
    listingCards: document.querySelectorAll('[data-testid*="listing"], [class*="listing-card"], [class*="ListingCard"], [class*="ResultCard"], article[class*="rent"], a[href*="/sanfrancisco/"]').length,
    propertyCards: document.querySelectorAll('[data-testid*="property"], [data-testid*="card"], [class*="property-card"]').length,
    moneyDivs: Array.from(document.querySelectorAll("div, span, a")).filter((el) =>
      /\$[\d,]+/.test(el.textContent ?? "")
    ).length,
    nextData: !!document.querySelector("script#__NEXT_DATA__"),
  }));
  console.log("counts:", counts);

  // Top API hits
  console.log("=== API hits ===");
  for (const h of apiHits.slice(0, 10)) {
    console.log(`  ${h.url.slice(0, 90)} (${h.len}b ${h.type})`);
  }

  await browser.close();
}

main().catch(console.error);
