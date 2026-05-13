import type { RawListing, Scraper, ScrapeContext } from "./types";

/**
 * Craigslist SF Bay — apartments for rent, SF city only (sfc).
 *
 * As of 2025 Craigslist serves a static search page with results in
 * <li class="cl-static-search-result"> blocks. RSS now returns 403.
 * We parse the HTML directly, then fetch each detail page concurrently to
 * pull coordinates + photos (which the search page omits).
 */

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Upgrade-Insecure-Requests": "1",
};

const DETAIL_CONCURRENCY = Number(process.env.CL_DETAIL_CONCURRENCY ?? 25);
const DETAIL_TIMEOUT_MS = 7000;
// Enrich everything by default — detail pages are cheap, concurrency handles speed.
const ENRICH_BUDGET = Number(process.env.CL_ENRICH_BUDGET ?? 200);
export const craigslist: Scraper = {
  source: "craigslist",
  async scrape(ctx: ScrapeContext): Promise<RawListing[]> {
    const url = new URL("https://sfbay.craigslist.org/search/sfc/apa");
    url.searchParams.set("min_bedrooms", String(ctx.bedrooms));
    url.searchParams.set("max_bedrooms", String(ctx.bedrooms + 1));
    url.searchParams.set("max_price", String(ctx.maxPrice));

    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`craigslist ${res.status}`);
    const html = await res.text();

    const now = new Date().toISOString();
    const out: RawListing[] = [];

    // Match each result li
    const liRegex = /<li[^>]*cl-static-search-result[^>]*>([\s\S]*?)<\/li>/g;
    let m: RegExpExecArray | null;
    while ((m = liRegex.exec(html)) !== null) {
      const block = m[0];
      const inner = m[1];

      const hrefMatch = inner.match(/<a\s+href="([^"]+)"/);
      const titleMatch = inner.match(/<div class="title">([^<]+)<\/div>/);
      const priceMatch = inner.match(/<div class="price">\s*\$?([\d,]+)\s*<\/div>/);
      const locMatch = inner.match(/<div class="location">\s*([^<]+?)\s*<\/div>/);

      if (!hrefMatch || !priceMatch || !titleMatch) continue;
      const href = hrefMatch[1];
      const price = parseInt(priceMatch[1].replace(/,/g, ""), 10);
      if (!Number.isFinite(price) || price > ctx.maxPrice) continue;

      const title = decode(titleMatch[1].trim());
      const location = locMatch ? decode(locMatch[1].trim()) : undefined;

      // Bedrooms sometimes in the title like "3br - 1500ft²"
      const bedTitle = block.match(/(\d)\s*(?:br|bd|bed)/i);
      const sqftTitle = block.match(/(\d{3,5})\s*(?:ft²|sqft|sq\.?\s*ft)/i);

      const sourceId = href.split("/").filter(Boolean).pop()?.replace(".html", "") ?? href;

      out.push({
        source: "craigslist",
        sourceId,
        url: href,
        title,
        price,
        bedrooms: bedTitle ? parseInt(bedTitle[1], 10) : undefined,
        sqft: sqftTitle ? parseInt(sqftTitle[1], 10) : undefined,
        addressLine: location,
        scrapedAt: now,
      });
    }

    // Enrich with detail-page data (coords + photos) concurrently.
    const toEnrich = out.slice(0, ENRICH_BUDGET);
    await runWithConcurrency(toEnrich, DETAIL_CONCURRENCY, async (listing) => {
      const detail = await fetchDetail(listing.url);
      if (!detail) return;
      if (detail.lat != null && detail.lng != null) {
        listing.lat = detail.lat;
        listing.lng = detail.lng;
      }
      if (detail.photoUrls.length) listing.photoUrls = detail.photoUrls;
      if (detail.bedrooms != null && listing.bedrooms == null) listing.bedrooms = detail.bedrooms;
      if (detail.bathrooms != null) listing.bathrooms = detail.bathrooms;
      if (detail.sqft != null && listing.sqft == null) listing.sqft = detail.sqft;
      if (detail.description) listing.description = detail.description;
    });
    return out;
  },
};

interface Detail {
  lat?: number;
  lng?: number;
  photoUrls: string[];
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  description?: string;
}

async function fetchDetail(url: string): Promise<Detail | null> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const geo = html.match(/data-latitude="([-.\d]+)"\s+data-longitude="([-.\d]+)"/);
    const lat = geo ? parseFloat(geo[1]) : undefined;
    const lng = geo ? parseFloat(geo[2]) : undefined;

    // Photos: prefer 600x450 full-size, dedup by image base id.
    const allPhotos = Array.from(
      html.matchAll(/(https:\/\/images\.craigslist\.org\/[\w\d_]+_[\w\d]+_600x450\.jpg)/g)
    ).map((m) => m[1]);
    const photoUrls = Array.from(new Set(allPhotos)).slice(0, 8);

    // Attribute lines: "BR / BA", "ft²", etc.
    const attrText = (html.match(/<p class="attrgroup">([\s\S]*?)<\/p>/g) ?? [])
      .map((s) => s.replace(/<[^>]*>/g, " "))
      .join(" ");
    const bedM = attrText.match(/(\d+)\s*BR/i);
    const baM = attrText.match(/(\d+(?:\.\d+)?)\s*Ba/i);
    const sqftM = attrText.match(/(\d{3,5})\s*ft²/i);

    const bodyM = html.match(/<section id="postingbody"[^>]*>([\s\S]*?)<\/section>/);
    const description = bodyM
      ? bodyM[1]
          .replace(/<div class="print-information[\s\S]*$/, "")
          .replace(/<[^>]*>/g, " ")
          .replace(/QR Code Link to This Post\s*/i, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000)
      : undefined;

    return {
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      photoUrls,
      bedrooms: bedM ? parseInt(bedM[1], 10) : undefined,
      bathrooms: baM ? parseFloat(baM[1]) : undefined,
      sqft: sqftM ? parseInt(sqftM[1], 10) : undefined,
      description,
    };
  } catch {
    return null;
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i]).catch(() => undefined);
    }
  });
  await Promise.all(runners);
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
