/**
 * Attempt: solve the PerimeterX "Press & Hold" captcha by simulating a real
 * mouse hold on the challenge button. The challenge tracks pointer events,
 * timing, micro-movements, and the press-duration distribution.
 */
import { chromium as ce } from "playwright-extra";
// @ts-ignore
import stealth from "puppeteer-extra-plugin-stealth";

ce.use(stealth());

async function main() {
  const browser = await ce.launch({
    headless: false, // PerimeterX checks for headless, try headed
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });
  const page = await ctx.newPage();
  await page.goto("https://www.zillow.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);

  let title = await page.title();
  console.log("initial title:", title);
  if (!/denied|press|robot/i.test(title)) {
    console.log("no challenge - homepage already loaded clean!");
    await browser.close();
    return;
  }

  // The PerimeterX challenge embeds an iframe with a button. Try:
  //   #px-captcha (main host)
  //   inside iframe[src*="captcha-delivery"]
  console.log("\nlooking for captcha button...");
  const candidates = [
    "#px-captcha",
    "div#px-captcha button",
    "div#px-captcha",
    'iframe[src*="captcha"]',
    'iframe[id*="captcha"]',
  ];
  let target: any;
  let frameContext = page;
  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      console.log("  found:", sel);
      target = loc;
      break;
    }
  }

  // If we have an iframe, drill into it
  if (!target) {
    const frames = page.frames();
    console.log("  frames:", frames.length);
    for (const f of frames) {
      console.log("    frame url:", f.url().slice(0, 80));
      const inner = f.locator('button, #px-captcha, [role="button"]').first();
      if ((await inner.count()) > 0) {
        target = inner;
        frameContext = f as any;
        console.log("  found inside frame");
        break;
      }
    }
  }

  if (!target) {
    console.log("no challenge button found");
    await page.screenshot({ path: "/tmp/zh-nocaptcha.png" });
    await browser.close();
    return;
  }

  const box = await target.boundingBox();
  if (!box) {
    console.log("no bounding box");
    await browser.close();
    return;
  }
  console.log("button box:", box);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Human-like approach: move mouse in, hover, then press for 7-9 seconds with micro-jitter
  await page.mouse.move(cx - 200, cy + 50, { steps: 30 });
  await page.waitForTimeout(500);
  await page.mouse.move(cx, cy, { steps: 20 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: "/tmp/zh-before-hold.png" });
  console.log("pressing and holding for 8s...");
  await page.mouse.down();
  // Micro-jitter during hold (humans don't hold perfectly still)
  const holdMs = 8000;
  const tickMs = 200;
  for (let elapsed = 0; elapsed < holdMs; elapsed += tickMs) {
    await page.waitForTimeout(tickMs);
    if (elapsed % 800 === 0) {
      await page.mouse.move(cx + (Math.random() * 2 - 1), cy + (Math.random() * 2 - 1));
    }
  }
  await page.mouse.up();
  console.log("released");
  await page.waitForTimeout(5000);
  title = await page.title();
  console.log("after-hold title:", title);
  await page.screenshot({ path: "/tmp/zh-after-hold.png" });

  // Did we pass?
  if (!/denied|press|robot/i.test(title)) {
    console.log("✓ CAPTCHA PASSED");
    // Navigate to rentals
    await page.goto("https://www.zillow.com/san-francisco-ca/rentals/3-_beds/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    console.log("rentals page title:", await page.title());
    const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
    console.log("body preview:", text.replace(/\n/g, " | ").slice(0, 250));
  } else {
    console.log("✗ challenge still active");
    const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 200);
    console.log("body:", text);
  }

  await browser.close();
}

main().catch((e) => {
  console.error("fatal:", e?.message);
  process.exit(1);
});
