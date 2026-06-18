import type { RawListing, Scraper, ScrapeContext } from "./types";

/**
 * Redfin's gis-csv endpoint returns a CSV of listings inside a region.
 * region_id 12148 = San Francisco. uipt=2 = condo, 1 = single-family, 4 = multi.
 * They block aggressively from cloud IPs; if blocked, returns [].
 */
export const redfin: Scraper = {
  source: "redfin",
  async scrape(ctx: ScrapeContext): Promise<RawListing[]> {
    if (ctx.city !== "san-francisco" || ctx.bedrooms == null) return [];
    const params = new URLSearchParams({
      al: "1",
      market: "sanfrancisco",
      max_price: String(ctx.maxPrice * 12), // Redfin uses annual? safer to widen
      min_beds: String(ctx.bedrooms),
      num_beds: String(ctx.bedrooms),
      num_homes: "350",
      ord: "redfin-recommended-asc",
      page_number: "1",
      region_id: "12148",
      region_type: "6",
      sf: "1,2,3,5,6,7",
      status: "9", // for rent
      uipt: "1,2,3,4",
      v: "8",
    });

    try {
      const res = await fetch(`https://www.redfin.com/stingray/api/gis-csv?${params}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
          Accept: "text/csv,application/json,*/*",
        },
      });
      if (!res.ok) {
        console.warn(`redfin blocked: ${res.status}`);
        return [];
      }
      const text = await res.text();
      return parseRedfinCsv(text, ctx);
    } catch (err) {
      console.warn("redfin error", err);
      return [];
    }
  },
};

function parseRedfinCsv(csv: string, ctx: ScrapeContext): RawListing[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvRow(lines[0]).map((h) => h.trim());
  const idx = (k: string) => headers.findIndex((h) => h.toLowerCase() === k.toLowerCase());
  const iPrice = idx("PRICE");
  const iBeds = idx("BEDS");
  const iBaths = idx("BATHS");
  const iSqft = idx("SQUARE FEET");
  const iAddress = idx("ADDRESS");
  const iZip = idx("ZIP OR POSTAL CODE");
  const iLat = idx("LATITUDE");
  const iLng = idx("LONGITUDE");
  const iUrl = idx("URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)");
  const iUrlFallback = headers.findIndex((h) => h.toUpperCase().startsWith("URL"));
  const urlCol = iUrl >= 0 ? iUrl : iUrlFallback;

  const now = new Date().toISOString();
  const out: RawListing[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    const price = parseInt((cols[iPrice] ?? "").replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(price) || price > ctx.maxPrice) continue;
    const url = cols[urlCol] ?? "";
    if (!url) continue;
    out.push({
      source: "redfin",
      sourceId: url.split("/").filter(Boolean).pop() ?? url,
      url,
      title: cols[iAddress] ?? "Redfin listing",
      price,
      bedrooms: Number(cols[iBeds]) || undefined,
      bathrooms: Number(cols[iBaths]) || undefined,
      sqft: Number(cols[iSqft]) || undefined,
      addressLine: cols[iAddress],
      zip: cols[iZip],
      lat: Number(cols[iLat]) || undefined,
      lng: Number(cols[iLng]) || undefined,
      scrapedAt: now,
    });
  }
  return out;
}

function splitCsvRow(row: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"') {
      if (q && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}
