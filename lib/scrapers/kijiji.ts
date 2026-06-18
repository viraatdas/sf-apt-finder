import type { RawListing, ScrapeContext, Scraper } from "./types";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

export const kijiji: Scraper = {
  source: "kijiji",
  async scrape(ctx: ScrapeContext): Promise<RawListing[]> {
    if (ctx.city !== "vancouver") return [];
    const url = new URL("https://www.kijiji.ca/b-for-rent/vancouver/c30349001l1700287");
    url.searchParams.set("price", `__${ctx.maxPrice}`);

    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`kijiji ${res.status}`);
    const html = await res.text();
    const rows = parseNextData(html);
    const now = new Date().toISOString();
    const out: RawListing[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      if (!isHousingRental(row)) continue;
      const price = normalizePrice(row?.price?.amount);
      if (!price || price > ctx.maxPrice) continue;
      const rawUrl = String(row?.url ?? "");
      if (!rawUrl) continue;
      const listingUrl = rawUrl.startsWith("http")
        ? rawUrl
        : new URL(rawUrl, "https://www.kijiji.ca").toString();
      if (seen.has(listingUrl)) continue;
      seen.add(listingUrl);

      out.push({
        source: "kijiji",
        sourceId: String(row?.id ?? listingUrl),
        url: listingUrl,
        title: text(row?.title) ?? "Kijiji listing",
        price,
        bedrooms: attrNumber(row, "numberbedrooms"),
        bathrooms: bathroomNumber(row),
        sqft: attrNumber(row, "areainfeet"),
        addressLine: text(row?.location?.address),
        lat: numberOr(row?.location?.coordinates?.latitude),
        lng: numberOr(row?.location?.coordinates?.longitude),
        description: text(row?.description)?.slice(0, 2000),
        photoUrls: Array.isArray(row?.imageUrls) ? row.imageUrls.slice(0, 8) : [],
        scrapedAt: now,
        raw: row,
      });
    }

    return out;
  },
};

function parseNextData(html: string): any[] {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return [];
  try {
    const data = JSON.parse(match[1]);
    const rows: any[] = [];
    walk(data, rows);
    return rows;
  } catch {
    return [];
  }
}

function walk(value: unknown, rows: any[]): void {
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  if (obj.__typename === "RealEstateListing") rows.push(obj);
  for (const child of Object.values(obj)) walk(child, rows);
}

function isHousingRental(row: any): boolean {
  const url = String(row?.url ?? "");
  if (/commercial-office-space|storage-parking/i.test(url)) return false;
  return /apartments-condos|room-rental-roommate|short-term-rental/i.test(url);
}

function normalizePrice(value: unknown): number {
  const n = numberOr(value);
  if (!n) return 0;
  return n > 10000 ? Math.round(n / 100) : n;
}

function attrNumber(row: any, name: string): number | undefined {
  const attrs = row?.attributes?.all;
  if (!Array.isArray(attrs)) return undefined;
  const attr = attrs.find((a: any) => a?.canonicalName === name);
  const raw = attr?.canonicalValues?.[0];
  return numberOr(raw);
}

function bathroomNumber(row: any): number | undefined {
  const direct = numberOr(row?.numberOfBathroomsTotal);
  if (direct != null) return direct;
  const raw = attrNumber(row, "numberbathrooms");
  if (raw == null) return undefined;
  return raw >= 10 ? raw / 10 : raw;
}

function numberOr(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
