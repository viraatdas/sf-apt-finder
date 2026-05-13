/**
 * Try to bypass Trulia's DataDome "Press & Hold" challenge.
 * Approach: detect the challenge iframe, find the button, mouse-hold for 6s.
 */
import { chromium as chromiumExtra } from "playwright-extra";
// @ts-ignore
import stealth from "puppeteer-extra-plugin-stealth";

chromiumExtra.use(stealth());

async function main() {
  const browser = await chromiumExtra.launch({
    headless: false, // headed has better chance — DataDome detects headless
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });
  const page = await ctx.newPage();
  await page.goto("https://www.trulia.com/for_rent/San_Francisco,CA/3p_beds/0-9000_price/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(2500);
  const title = await page.title();
  console.log("title after load:", title);

  if (/access|denied|robot|press/i.test(title)) {
    console.log("→ challenge detected, attempting press-and-hold");
    // The DataDome challenge embeds in an iframe; the button has #px-captcha
    // Try several known selectors
    const selectors = [
      "#px-captcha",
      "iframe[src*='datadome']",
      "iframe[id*='captcha']",
      "button:has-text('Press')",
      "div:has-text('Press & Hold')",
    ];
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      const count = await el.count();
      console.log(`  ${sel} → ${count} match`);
      if (count > 0) {
        try {
          const box = await el.boundingBox();
          if (box) {
            console.log(`  found at ${box.x},${box.y} ${box.width}x${box.height}`);
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(7000);
            await page.mouse.up();
            await page.waitForTimeout(4000);
            const newTitle = await page.title();
            console.log("  title after press:", newTitle);
            if (!/access|denied|press/i.test(newTitle)) {
              console.log("  ✔ challenge passed!");
              break;
            }
          }
        } catch (e: any) {
          console.log("  press failed:", e.message);
        }
      }
    }
  }

  const finalTitle = await page.title();
  console.log("final title:", finalTitle);
  const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
  const dollars = (text.match(/\$\d/g) ?? []).length;
  console.log("$ count in body:", dollars);
  await browser.close();
}
main().catch(console.error);
