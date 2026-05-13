/**
 * Intercept Padmapper's network traffic to find the listings API.
 */
import { chromium as chromiumExtra } from "playwright-extra";
// @ts-ignore
import stealth from "puppeteer-extra-plugin-stealth";

chromiumExtra.use(stealth());

async function main() {
  const browser = await chromiumExtra.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  const hits: Array<{ url: string; type: string; len: number; body?: string }> = [];

  page.on("response", async (res) => {
    const url = res.url();
    const type = res.headers()["content-type"] ?? "";
    if (!type.includes("json")) return;
    if (url.includes("cookielaw") || url.includes("rubicon") || url.includes("id5") || url.includes("googletag")) return;
    try {
      const body = await res.text();
      if (body.length < 500) return;
      hits.push({ url, type, len: body.length, body: body.slice(0, 500) });
    } catch {}
  });

  await page.goto("https://www.padmapper.com/apartments/san-francisco-ca/3-bedrooms-under-9000", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(8000);
  // Trigger more loading
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(1500);
  }
  // Drag map to trigger reload
  await page.mouse.move(700, 400);
  await page.waitForTimeout(500);

  console.log(`=== ${hits.length} JSON responses ===`);
  // Sort by size, biggest first — listings APIs are usually large
  hits.sort((a, b) => b.len - a.len);
  for (const h of hits.slice(0, 10)) {
    console.log(`${h.len.toString().padStart(7)}b  ${h.url.slice(0, 110)}`);
    console.log(`        preview: ${h.body?.slice(0, 200).replace(/\s+/g, " ")}`);
  }

  await browser.close();
}
main().catch(console.error);
