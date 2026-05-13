import { chromium as chromiumExtra } from "playwright-extra";
// @ts-ignore
import stealth from "puppeteer-extra-plugin-stealth";

chromiumExtra.use(stealth());

async function main() {
  const browser = await chromiumExtra.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 Chrome/131.0",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  const padHits: Array<{ url: string; type: string; len: number; preview: string }> = [];
  const wsHits: Array<{ url: string; first: string }> = [];

  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("padmapper.com") && !url.includes("zumper")) return;
    try {
      const body = await res.text();
      if (body.length < 200) return;
      padHits.push({
        url,
        type: res.headers()["content-type"] ?? "?",
        len: body.length,
        preview: body.slice(0, 350),
      });
    } catch {}
  });
  page.on("websocket", (ws) => {
    const wsObj = { url: ws.url(), first: "" };
    wsHits.push(wsObj);
    ws.on("framereceived", (frame: any) => {
      if (!wsObj.first) wsObj.first = String(frame.payload ?? "").slice(0, 200);
    });
  });

  await page.goto("https://www.padmapper.com/apartments/san-francisco-ca/3-bedrooms-under-9000", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(8000);

  // Look at how many listing markers appear on map
  const markerCount = await page.evaluate(() => {
    return document.querySelectorAll("[class*='marker'], [class*='Marker'], [class*='cluster'], [class*='Cluster'], [class*='pin']").length;
  });
  console.log(`markers in DOM: ${markerCount}`);

  console.log(`\n=== padmapper domain JSON/XHR (${padHits.length}) ===`);
  padHits.sort((a, b) => b.len - a.len);
  for (const h of padHits.slice(0, 12)) {
    console.log(`${h.len.toString().padStart(7)}b  type:${h.type.slice(0, 40).padEnd(40)}  ${h.url.slice(60)}`);
    console.log(`  preview: ${h.preview.slice(0, 150).replace(/\s+/g, " ")}`);
  }

  console.log(`\n=== websockets (${wsHits.length}) ===`);
  for (const w of wsHits) console.log(` ${w.url}\n   first: ${w.first}`);

  await browser.close();
}
main().catch(console.error);
