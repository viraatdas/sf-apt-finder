/**
 * Last-ditch Zillow attempt: navigate as a human does — homepage first,
 * mouse movement + typing, then filters. Saves listings + screenshots to /tmp.
 */
import { chromium as ce } from "playwright-extra";
// @ts-ignore
import stealth from "puppeteer-extra-plugin-stealth";

ce.use(stealth());

async function main() {
  const browser = await ce.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    permissions: ["geolocation"],
    geolocation: { latitude: 37.7749, longitude: -122.4194 },
  });
  const page = await ctx.newPage();

  console.log("step 1: homepage");
  await page.goto("https://www.zillow.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log("  title:", await page.title());
  await page.screenshot({ path: "/tmp/z1-home.png" });

  // Move mouse like a human
  await page.mouse.move(200, 300);
  await page.waitForTimeout(400);
  await page.mouse.move(600, 400);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(700);

  console.log("step 2: search box");
  // Find the search input
  const searchSelectors = [
    'input[id*="search"]',
    'input[placeholder*="address"i]',
    'input[placeholder*="search"i]',
    'input[type="text"]',
  ];
  let searchInput;
  for (const sel of searchSelectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      searchInput = el;
      console.log("  using selector:", sel);
      break;
    }
  }
  if (!searchInput) {
    console.log("  no search box found");
    console.log("  body preview:", (await page.locator("body").innerText()).slice(0, 300));
    await page.screenshot({ path: "/tmp/z2-no-search.png" });
    await browser.close();
    return;
  }

  await searchInput.click();
  await page.waitForTimeout(500);
  await page.keyboard.type("San Francisco, CA", { delay: 90 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/z3-typed.png" });

  // Click rent button if visible, then Enter
  await page.keyboard.press("Enter");
  console.log("step 3: pressed Enter, waiting for results");
  await page.waitForTimeout(8000);
  console.log("  url:", page.url());
  console.log("  title:", await page.title());
  const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
  console.log("  body preview:", text.replace(/\n/g, " | ").slice(0, 200));
  await page.screenshot({ path: "/tmp/z4-results.png" });

  // Try to navigate to /rentals filter
  const denied = /access has been denied|press & hold|press and hold|are you a robot/i.test(text);
  console.log("  blocked?", denied);

  if (!denied) {
    // Try the For Rent tab
    const forRent = page.locator('a:has-text("For Rent"), button:has-text("For Rent")').first();
    if ((await forRent.count()) > 0) {
      console.log("step 4: clicking For Rent");
      await forRent.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(5000);
      console.log("  url:", page.url());
    }
  }

  // Final dump: __NEXT_DATA__ or listings count
  const data = await page.evaluate(() => {
    const next = document.querySelector("script#__NEXT_DATA__");
    let listingCount = 0;
    let priceTexts: string[] = [];
    document.querySelectorAll('article, [data-testid*="search-list"] *, [class*="ListItem"]').forEach((el) => {
      const t = (el as HTMLElement).innerText ?? "";
      if (/\$\d/.test(t) && t.length < 500) {
        listingCount++;
        if (priceTexts.length < 3) priceTexts.push(t.slice(0, 120));
      }
    });
    return {
      hasNextData: !!next,
      nextDataSize: next?.textContent?.length ?? 0,
      listingCount,
      priceTexts,
    };
  });
  console.log("\nFINAL:", JSON.stringify(data, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
