import type { Page } from "playwright";
import type { RawListing, ScrapeContext } from "../types";
import type { BrowserScraper } from "./index";

/**
 * HotPads — tiles have a [data-renderstrat] root with /pad URLs.
 * Probe found 57+ tiles on a single page, no pagination needed for SF 3BR.
 */
export const hotpads: BrowserScraper = {
  source: "hotpads",
  async scrape(ctx: ScrapeContext, page: Page): Promise<RawListing[]> {
    if (ctx.city !== "san-francisco" || ctx.bedrooms == null) return [];
    const url = `https://hotpads.com/san-francisco-ca/apartments-for-rent?beds=${ctx.bedrooms}-&maxRent=${ctx.maxPrice}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 1800));
      await page.waitForTimeout(700);
    }
    // Scroll back up + scroll each tile into view to trigger lazy-loaded photos.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    await page.evaluate(async () => {
      const tiles = Array.from(document.querySelectorAll<HTMLElement>("[data-renderstrat]"));
      for (const t of tiles) {
        t.scrollIntoView({ block: "center" });
        await new Promise((r) => setTimeout(r, 250));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);

    const items = await page.evaluate((maxPrice) => {
      const tiles = Array.from(
        document.querySelectorAll<HTMLElement>("[data-renderstrat]")
      );
      const seen = new Set<string>();
      const out: any[] = [];
      for (const tile of tiles) {
        const a = tile.querySelector<HTMLAnchorElement>('a[href*="/pad"], a[href*="/sm"], a[href*="hotpads.com/"]');
        const href = a?.getAttribute("href");
        if (!href) continue;
        const fullUrl = href.startsWith("http") ? href : `https://hotpads.com${href}`;
        if (seen.has(fullUrl)) continue;
        seen.add(fullUrl);

        const text = tile.innerText ?? "";
        const priceM = text.match(/\$\s*([\d,]+)(?:\s*[-–]\s*\$\s*([\d,]+))?/);
        if (!priceM) continue;
        const priceA = parseInt(priceM[1].replace(/,/g, ""), 10);
        const priceB = priceM[2] ? parseInt(priceM[2].replace(/,/g, ""), 10) : priceA;
        const price = Math.min(priceA, priceB);
        if (!Number.isFinite(price) || price > maxPrice) continue;

        const bedM = text.match(/(\d+)\s*(?:bd|bed|br)/i);
        const baM = text.match(/(\d+(?:\.\d+)?)\s*(?:ba|bath)/i);
        const sqftM = text.match(/([\d,]+)\s*(?:sqft|sq\s*ft)/i);
        const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
        // Building name: usually after "$X | beds | units available"
        const name = lines.find((l) => l.length > 4 && !/^\$|^\d+\s*(bed|ba)|^Favorite|^Previous|^Next|^Contact|^Apt\b/i.test(l));
        const addr = lines.find((l) => /\b(st|ave|blvd|rd|dr|ct|pl|way|ter)\b/i.test(l) && /\d/.test(l));
        // Real listing photos are on img.zumpercdn.com (Zumper owns HotPads).
        // Multiple imgs per tile: heart-svg, carousel arrows, then the photo.
        const photoUrls = Array.from(tile.querySelectorAll("img"))
          .map((i: any) => i.currentSrc || i.src)
          .filter((s): s is string => typeof s === "string" && /img\.zumpercdn\.com|photos\.hotpads|images\.zumper/i.test(s));
        out.push({
          href: fullUrl,
          sourceId: href.replace(/^\//, "").split("/")[0],
          title: (name ?? lines[0] ?? "HotPads listing").slice(0, 200),
          price,
          bedrooms: bedM ? parseInt(bedM[1], 10) : undefined,
          bathrooms: baM ? parseFloat(baM[1]) : undefined,
          sqft: sqftM ? parseInt(sqftM[1].replace(/,/g, ""), 10) : undefined,
          addressLine: addr,
          photoUrls: Array.from(new Set(photoUrls)).slice(0, 6),
        });
      }
      return out;
    }, ctx.maxPrice);

    const now = new Date().toISOString();
    const listings: RawListing[] = items.map((it: any) => ({
      source: "hotpads",
      sourceId: String(it.sourceId),
      url: it.href,
      title: it.title,
      price: it.price,
      bedrooms: it.bedrooms,
      bathrooms: it.bathrooms,
      sqft: it.sqft,
      addressLine: it.addressLine,
      photoUrls: it.photoUrls ?? [],
      scrapedAt: now,
    }));

    // Photo enrichment: HotPads doesn't load photos on the search page; they're
    // pre-rendered in each detail page's HTML inside a hidden modal. Visit each
    // detail page concurrently via the shared browser context (same cookies +
    // session) and grep for photos.zillowstatic.com URLs.
    await enrichHotpadsPhotos(page, listings);

    return listings;
  },
};

const PHOTO_RX =
  /https:\/\/photos\.zillowstatic\.com\/fp\/[A-Za-z0-9]+-(?:rentals_large_1200_1200|rentals_medium_500_500|cc_ft_1152|cc_ft_768)\.(?:webp|jpg|jpeg)/g;

async function enrichHotpadsPhotos(page: Page, listings: RawListing[]): Promise<void> {
  const need = listings.filter((l) => (l.photoUrls?.length ?? 0) === 0);
  if (!need.length) return;
  console.log(`[hotpads] enriching photos for ${need.length} listings...`);

  const ctx = page.context();
  const CONCURRENCY = 3;
  // Spawn dedicated worker pages — each uses the same stealth context so
  // headers/fingerprint pass the bot wall like the search page did.
  const workers = await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, need.length) }, () => ctx.newPage())
  );

  let idx = 0;
  let success = 0;
  await Promise.all(
    workers.map(async (worker) => {
      while (idx < need.length) {
        const i = idx++;
        const l = need[i];
        try {
          await worker.goto(l.url, { waitUntil: "domcontentloaded", timeout: 15000 });
          // Photos render in HTML quickly — no need to wait for full networkidle.
          await worker.waitForTimeout(800);
          const html = await worker.content();
          const matches = Array.from(html.matchAll(PHOTO_RX)).map((m) => m[0]);
          const photoUrls = Array.from(new Set(matches)).slice(0, 8);
          if (photoUrls.length) {
            l.photoUrls = photoUrls;
            success++;
          }
        } catch (err) {
          // partial enrichment fine
        }
      }
      await worker.close();
    })
  );
  console.log(`[hotpads] photo enrichment: ${success}/${need.length} got photos`);
}
