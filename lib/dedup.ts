import crypto from "node:crypto";
import { DEFAULT_CITY, type CityId } from "./cities";
import type { RawListing } from "./scrapers/types";

/** Stable canonical ID for a listing.
 * Priority:
 *   1. Geo (lat,lng rounded to ~10m) + bedrooms — most reliable cross-source key
 *   2. Specific street address + zip + bedrooms (skip generic "city of X" labels)
 *   3. Per-source fallback so each post is its own listing
 */
export function canonicalId(r: {
  source?: string;
  sourceId?: string;
  city?: CityId;
  url?: string;
  addressLine?: string;
  zip?: string;
  bedrooms?: number;
  sqft?: number;
  lat?: number;
  lng?: number;
}): string {
  const city = r.city ?? DEFAULT_CITY;
  if (r.lat != null && r.lng != null) {
    const k = `${city}|geo:${r.lat.toFixed(4)},${r.lng.toFixed(4)}|${r.bedrooms ?? ""}`;
    return "g_" + sha(k);
  }
  const addr = normalizeAddress(r.addressLine);
  if (isSpecificAddress(addr)) {
    const k = `${city}|${addr}|${r.zip ?? ""}|${r.bedrooms ?? ""}`;
    return "a_" + sha(k);
  }
  // Per-source fallback: each post gets a stable, unique ID.
  return `s_${(r.source ?? "x").slice(0, 12)}_${sha(`${city}|${r.sourceId ?? r.url ?? Math.random().toString()}`)}`;
}

/** Treat strings like "city of", "san francisco", neighborhood-only as not specific. */
function isSpecificAddress(addr: string): boolean {
  if (!addr) return false;
  if (addr.length < 6) return false;
  // Must contain a digit (street number) to be specific
  if (!/\d/.test(addr)) return false;
  if (/^city of\b/.test(addr)) return false;
  return true;
}

function sha(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

/** Lowercase, strip unit numbers, normalize street types. */
export function normalizeAddress(input?: string): string {
  if (!input) return "";
  let s = input.toLowerCase().trim();
  // strip leading "unit X" or "#X" segments
  s = s.replace(/[#]\s*[\w-]+/g, "");
  s = s.replace(/\b(apt|unit|ste|suite|#)\s*[\w-]+/gi, "");
  s = s.replace(/\b(street|st\.?)\b/g, "st");
  s = s.replace(/\b(avenue|ave\.?)\b/g, "ave");
  s = s.replace(/\b(boulevard|blvd\.?)\b/g, "blvd");
  s = s.replace(/\b(road|rd\.?)\b/g, "rd");
  s = s.replace(/\b(drive|dr\.?)\b/g, "dr");
  s = s.replace(/\b(court|ct\.?)\b/g, "ct");
  s = s.replace(/\b(place|pl\.?)\b/g, "pl");
  s = s.replace(/\b(terrace|ter\.?)\b/g, "ter");
  s = s.replace(/\b(north|n\.?)\b/g, "n");
  s = s.replace(/\b(south|s\.?)\b/g, "s");
  s = s.replace(/\b(east|e\.?)\b/g, "e");
  s = s.replace(/\b(west|w\.?)\b/g, "w");
  s = s.replace(/[,.]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // drop city/state suffix
  s = s.replace(/\bsan francisco\b.*$/, "").trim();
  s = s.replace(/\bvancouver\b.*$/, "").trim();
  s = s.replace(/\bca\b.*$/, "").trim();
  s = s.replace(/\bbc\b.*$/, "").trim();
  s = s.replace(/\bcanada\b.*$/, "").trim();
  return s;
}

/**
 * Group raw listings into canonical buckets. Within a bucket we keep the
 * record with the most detail, but merge price/photos/sources from siblings.
 */
export interface MergedListing {
  id: string;
  title: string;
  addressLine?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  price: number; // min across sources
  pricesBySource: Record<string, number>;
  description?: string;
  photoUrls: string[];
  sources: Array<{ source: string; url: string; sourceId: string; scrapedAt: string }>;
  raw: Record<string, unknown>;
}

export function mergeRaw(raws: RawListing[], city: CityId = DEFAULT_CITY): MergedListing[] {
  const buckets = new Map<string, RawListing[]>();
  for (const r of raws) {
    const id = canonicalId({ ...r, city });
    const arr = buckets.get(id) ?? [];
    arr.push(r);
    buckets.set(id, arr);
  }
  const out: MergedListing[] = [];
  for (const [id, group] of buckets) {
    const best = pickBest(group);
    const pricesBySource: Record<string, number> = {};
    const sources: MergedListing["sources"] = [];
    const photos = new Set<string>();
    for (const g of group) {
      pricesBySource[g.source] = g.price;
      sources.push({ source: g.source, url: g.url, sourceId: g.sourceId, scrapedAt: g.scrapedAt });
      for (const p of g.photoUrls ?? []) photos.add(p);
    }
    out.push({
      id,
      title: best.title,
      addressLine: best.addressLine,
      zip: best.zip,
      lat: best.lat,
      lng: best.lng,
      bedrooms: best.bedrooms,
      bathrooms: best.bathrooms,
      sqft: best.sqft,
      price: Math.min(...Object.values(pricesBySource)),
      pricesBySource,
      description: best.description,
      photoUrls: Array.from(photos),
      sources,
      raw: group.reduce<Record<string, unknown>>((acc, g) => {
        acc[g.source] = g.raw ?? null;
        return acc;
      }, {}),
    });
  }
  return out;
}

function pickBest(group: RawListing[]): RawListing {
  // Highest "completeness" score wins.
  return group
    .map((r) => ({ r, score: completeness(r) }))
    .sort((a, b) => b.score - a.score)[0]!.r;
}

function completeness(r: RawListing): number {
  let s = 0;
  if (r.addressLine) s += 3;
  if (r.lat && r.lng) s += 3;
  if (r.zip) s += 1;
  if (r.bedrooms != null) s += 1;
  if (r.bathrooms != null) s += 1;
  if (r.sqft) s += 1;
  if (r.description) s += 1;
  if ((r.photoUrls ?? []).length) s += 2;
  return s;
}
