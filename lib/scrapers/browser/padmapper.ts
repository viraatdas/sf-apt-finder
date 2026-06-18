import type { Page } from "playwright";
import type { RawListing, ScrapeContext } from "../types";
import type { BrowserScraper } from "./index";

/**
 * Padmapper — server-side rendered. Each page caps at ~22 listing cards.
 * Strategy: visit each SF neighborhood page, parse cards, filter to 3BR + ≤maxPrice.
 *
 * Card shape (from inspection):
 *   <div class="relative inline-block ... bg-gray-0 border ...">
 *     <a href="/rentals/<id>/..."> or </buildings/<id>/...">
 *     text: "VERIFIED | $4,595 | 2 Bedrooms · 1 Bathroom Apartment · Neighborhood | Address"
 *   </div>
 */

const SF_NEIGHBORHOODS = [
  "pacific-heights",
  "marina",
  "russian-hill",
  "north-beach",
  "nob-hill",
  "financial-district",
  "soma",
  "mission-bay",
  "potrero-hill",
  "mission",
  "noe-valley",
  "castro",
  "hayes-valley",
  "nopa",
  "lower-haight",
  "haight-ashbury",
  "inner-sunset",
  "sunset",
  "richmond",
  "western-addition",
  "bernal-heights",
];

export const padmapper: BrowserScraper = {
  source: "padmapper",
  async scrape(ctx: ScrapeContext, page: Page): Promise<RawListing[]> {
    if (ctx.city !== "san-francisco" || ctx.bedrooms == null) return [];
    const targetBeds = ctx.bedrooms;
    const all: RawListing[] = [];
    const seen = new Set<string>();
    const now = new Date().toISOString();

    // Cap to ~8 neighborhoods to stay within reasonable runtime (~80s).
    // Iterate through them; later add more by setting PM_NEIGHBORHOODS env.
    // Cover most of SF — ~15 neighborhoods runs in ~60s. Override with PM_NEIGHBORHOODS env.
    const list = (process.env.PM_NEIGHBORHOODS ?? SF_NEIGHBORHOODS.slice(0, 15).join(",")).split(",");

    for (const hood of list) {
      const url = `https://www.padmapper.com/apartments/san-francisco-ca/${hood}`;
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        await page.waitForTimeout(3500);
        // Scroll each card into view to trigger lazy photo loading.
        await page.evaluate(async () => {
          const cards = Array.from(document.querySelectorAll("div.relative.inline-block.bg-gray-0"));
          for (const c of cards) {
            (c as HTMLElement).scrollIntoView({ block: "center" });
            await new Promise((r) => setTimeout(r, 150));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(1200);
      } catch (err) {
        console.log(`[padmapper] ${hood} goto error`);
        continue;
      }

      const rows = await page.evaluate(() => {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>("div.relative.inline-block.bg-gray-0")
        );
        const out: any[] = [];
        for (const c of cards) {
          const a = c.querySelector<HTMLAnchorElement>(
            'a[href*="/rentals/"], a[href*="/buildings/"]'
          );
          if (!a) continue;
          const text = (c.innerText ?? "").replace(/\n+/g, " | ").trim();
          // "VERIFIED | $4,595 | 2 Bedrooms · 1 Bathroom Apartment · Lower Haight | 677 Oak Street #8"
          // OR a price range: "$2,450–$4,800 | Studio–2 Bedrooms"
          const priceM = text.match(/\$\s*([\d,]+)(?:\s*[–\-]\s*\$?\s*([\d,]+))?/);
          if (!priceM) continue;
          const priceA = parseInt(priceM[1].replace(/,/g, ""), 10);
          const priceB = priceM[2] ? parseInt(priceM[2].replace(/,/g, ""), 10) : priceA;
          // For range listings, use lowest price (the "from" price)
          const price = Math.min(priceA, priceB);
          // Bedroom: single value or range
          const bedRange = text.match(/(\d+)\s*[–\-]\s*(\d+)\s*Bedrooms?/i);
          const bedSingle = text.match(/(\d+)\s*Bedrooms?/i);
          const bedStudio = /\bStudio\b/i.test(text);
          let bedrooms: number | undefined;
          let bedrooms_max: number | undefined;
          if (bedRange) {
            bedrooms = parseInt(bedRange[1], 10);
            bedrooms_max = parseInt(bedRange[2], 10);
          } else if (bedSingle) {
            bedrooms = parseInt(bedSingle[1], 10);
          } else if (bedStudio) {
            bedrooms = 0;
          }
          const baM = text.match(/(\d+(?:\.\d+)?)\s*Bathrooms?/i);
          const sqftM = text.match(/([\d,]+)\s*(?:sqft|sq\s*ft)/i);
          // Address: usually after the last "|" if neighborhood is in text
          const segs = text.split("|").map((s) => s.trim());
          const addr = segs.find((s) =>
            /^\d+\s+\w/.test(s) && /\b(st|ave|blvd|rd|dr|ct|pl|way|ter|street|avenue|boulevard|drive)\b/i.test(s)
          );
          const neighborhoodIn = segs
            .map((s) => s.match(/(?:· |\| )?([A-Z][\w\s\-']+?)(?: \| | San Francisco)/i))
            .find((m) => m)?.[1];
          // Real photos live on img.zumpercdn.com — multiple <img> tags per card
          // (the first one is usually a carousel arrow SVG). Find by domain.
          const photos = Array.from(c.querySelectorAll("img"))
            .map((i: any) => i.currentSrc || i.src)
            .filter((s): s is string => typeof s === "string" && /img\.zumpercdn\.com/.test(s));
          // Dedup and pick high-res variant from srcset if available
          const photoUrls = Array.from(new Set(photos)).slice(0, 6);

          out.push({
            href: a.href,
            text: text.slice(0, 400),
            price,
            bedrooms,
            bedrooms_max,
            bathrooms: baM ? parseFloat(baM[1]) : undefined,
            sqft: sqftM ? parseInt(sqftM[1].replace(/,/g, ""), 10) : undefined,
            addressLine: addr,
            neighborhood: neighborhoodIn?.trim(),
            photoUrls,
          });
        }
        return out;
      });

      console.log(`[padmapper] ${hood}: ${rows.length} cards (${rows.filter((r) => (r.bedrooms ?? 0) >= targetBeds || (r.bedrooms_max ?? 0) >= targetBeds).length} match beds)`);

      for (const r of rows) {
        if (seen.has(r.href)) continue;
        // Filter: needs to match desired bed count (single OR within range)
        const minB = r.bedrooms ?? 0;
        const maxB = r.bedrooms_max ?? minB;
        if (maxB < targetBeds) continue;
        // Skip range listings where 3BR is above the high-end of the range
        if (r.bedrooms_max != null && r.bedrooms_max < targetBeds) continue;
        if (r.price > ctx.maxPrice) continue;
        seen.add(r.href);
        const slugId = r.href.match(/\/(?:rentals|buildings)\/([^/]+)/)?.[1] ?? r.href;
        // Title: bedroom/bath summary
        const title = r.addressLine ?? r.text.split("|")[1]?.trim() ?? "Padmapper listing";
        all.push({
          source: "padmapper",
          sourceId: slugId,
          url: r.href,
          title: title.slice(0, 200),
          price: r.price,
          bedrooms: r.bedrooms,
          bathrooms: r.bathrooms,
          sqft: r.sqft,
          addressLine: r.addressLine,
          photoUrls: r.photoUrls ?? [],
          scrapedAt: now,
        });
      }
    }

    return all;
  },
};
