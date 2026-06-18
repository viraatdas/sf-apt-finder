import type { Page } from "playwright";
import type { RawListing, ScrapeContext } from "../types";
import type { BrowserScraper } from "./index";

export const livrent: BrowserScraper = {
  source: "livrent",
  async scrape(ctx: ScrapeContext, page: Page): Promise<RawListing[]> {
    if (ctx.city !== "vancouver") return [];
    await page.goto("https://liv.rent/rental-listings/city/vancouver", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3500);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 1600));
      await page.waitForTimeout(600);
    }

    const html = await page.content();
    const rows = extractListingObjects(html);
    const now = new Date().toISOString();
    const out: RawListing[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const price = numberOr(row.price);
      if (!price || price > ctx.maxPrice) continue;
      const sourceId = String(row.listing_id ?? row.cover_photo_aws_s3_key ?? "");
      if (!sourceId || seen.has(sourceId)) continue;
      seen.add(sourceId);
      const unitType = formatUnitType(row.unit_type_txt_id);
      const title = [
        row.bedrooms != null ? `${row.bedrooms} bed` : null,
        unitType,
        "on liv.rent",
      ]
        .filter(Boolean)
        .join(" ");

      out.push({
        source: "livrent",
        sourceId,
        url: "https://liv.rent/rental-listings/city/vancouver",
        title,
        price,
        bedrooms: numberOr(row.bedrooms),
        bathrooms: numberOr(row.bathrooms),
        sqft: numberOr(row.size),
        description: typeof row.description === "string" ? row.description.slice(0, 2000) : undefined,
        photoUrls: pickPhotos(row),
        scrapedAt: now,
        raw: row,
      });
    }

    return out;
  },
};

function extractListingObjects(html: string): any[] {
  const text = html.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  const objects = extractBalancedJson(text, '{"__typename":"Listing"');
  return objects.flatMap((raw) => {
    try {
      return [JSON.parse(raw)];
    } catch {
      return [];
    }
  });
}

function extractBalancedJson(text: string, marker: string): string[] {
  const out: string[] = [];
  let pos = 0;
  while ((pos = text.indexOf(marker, pos)) !== -1) {
    const start = pos;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          out.push(text.slice(start, i + 1));
          pos = i + 1;
          break;
        }
      }
    }
    pos++;
    if (out.length >= 80) break;
  }
  return out;
}

function pickPhotos(row: any): string[] {
  const files = Array.isArray(row.unit_files) ? row.unit_files : [];
  return files
    .map((file: any) => file?.aws_s3_key)
    .filter((key: unknown): key is string => typeof key === "string" && key.length > 0)
    .slice(0, 8)
    .map((key: string) => `https://cdn.liv.rent/800x/filters:quality(75)/${key}`);
}

function numberOr(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function formatUnitType(value: unknown): string {
  if (typeof value !== "string" || !value) return "rental";
  return value.toLowerCase().replace(/_/g, " ");
}
