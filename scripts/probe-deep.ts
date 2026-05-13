/**
 * Deeper probe: inspect the actual DOM structure of listing tiles to nail selectors.
 */
import { chromium as chromiumExtra } from "playwright-extra";
// @ts-ignore
import stealth from "puppeteer-extra-plugin-stealth";

chromiumExtra.use(stealth());

const SITES: Record<string, string> = {
  hotpads: "https://hotpads.com/san-francisco-ca/apartments-for-rent?beds=3-&maxRent=9000",
  padmapper: "https://www.padmapper.com/apartments/san-francisco-ca/3-bedrooms-under-9000",
  zumper: "https://www.zumper.com/apartments-for-rent/san-francisco-ca/3-bedrooms?max_price=9000",
};

async function main() {
  const name = process.argv[2] || "hotpads";
  const url = SITES[name];
  const browser = await chromiumExtra.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 Chrome/131.0",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);
  // Scroll
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(700);
  }

  const struct = await page.evaluate(() => {
    // Find all elements with dollar prices, inspect their hierarchy
    const moneyEls = Array.from(document.querySelectorAll("div, span, a, p, h1, h2, h3, h4")).filter(
      (el) => /\$\s*\d[\d,]*/.test(el.textContent ?? "") && (el.textContent ?? "").length < 200
    );
    // Group by the nearest ancestor that looks like a card
    const tiles = new Set<HTMLElement>();
    for (const m of moneyEls.slice(0, 80)) {
      // walk up to find the tile
      let n: HTMLElement | null = m as HTMLElement;
      while (n && n.parentElement) {
        const text = n.innerText ?? "";
        if (text.length > 60 && text.length < 500 && /\$\d/.test(text) && /bed|bd|br|bath|ba/i.test(text)) {
          tiles.add(n);
          break;
        }
        n = n.parentElement;
      }
    }
    const sample = Array.from(tiles).slice(0, 3).map((t) => {
      const a = t.querySelector("a");
      return {
        tag: t.tagName,
        cls: t.className?.toString().slice(0, 100),
        ds: Object.keys((t as any).dataset ?? {}),
        text: (t.innerText ?? "").slice(0, 300).replace(/\n/g, " | "),
        href: a?.getAttribute("href"),
      };
    });
    return { count: tiles.size, sample };
  });

  console.log(JSON.stringify(struct, null, 2));
  await browser.close();
}
main().catch(console.error);
