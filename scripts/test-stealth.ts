/**
 * Quick stealth test: fetch Zumper, Padmapper, Apartments.com, Zillow and report
 * whether real listing data is visible past the bot challenge.
 */
import { chromium as chromiumExtra } from "playwright-extra";
// @ts-ignore - puppeteer-extra-plugin-stealth has no types but works with playwright-extra
import stealth from "puppeteer-extra-plugin-stealth";

chromiumExtra.use(stealth());

const TARGETS = [
  ["zumper", "https://www.zumper.com/apartments-for-rent/san-francisco-ca/3-bedrooms"],
  ["padmapper", "https://www.padmapper.com/apartments/san-francisco-ca/3-bedrooms-under-9000"],
  ["apartments", "https://www.apartments.com/san-francisco-ca/3-bedrooms-under-9000/"],
  ["zillow", "https://www.zillow.com/san-francisco-ca/rentals/3-_beds/"],
  ["trulia", "https://www.trulia.com/for_rent/San_Francisco,CA/3p_beds/0-9000_price/"],
];

async function main() {
  const browser = await chromiumExtra.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });

  for (const [name, url] of TARGETS) {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      // Wait for listings UI
      await page.waitForTimeout(3500);
      const title = await page.title();
      const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 200);
      const hasChallenge = /challenge|verify you are|are you a robot|press & hold/i.test(
        title + " " + bodyText
      );
      // Probe for currency signs in body, a strong signal that real listings rendered
      const dollarCount = (bodyText.match(/\$/g) ?? []).length;
      console.log(
        `${name.padEnd(12)} title=${title.slice(0, 40).padEnd(40)}  $count=${dollarCount}  challenge=${hasChallenge}`
      );
    } catch (err: any) {
      console.log(`${name.padEnd(12)} ERROR ${err.message}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
