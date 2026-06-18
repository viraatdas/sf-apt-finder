import { CITIES, type CityId, type ScraperKey } from "@/lib/cities";
import type { Source } from "@/lib/scrapers/types";

export const SOURCE_INFO: Record<Source, { label: string; note?: string }> = {
  craigslist: { label: "Craigslist" },
  kijiji: { label: "Kijiji" },
  zillow: { label: "Zillow" },
  redfin: { label: "Redfin" },
  realtor: { label: "Realtor.com" },
  "apartments-com": { label: "Apartments.com" },
  trulia: { label: "Trulia" },
  padmapper: { label: "PadMapper" },
  hotpads: { label: "HotPads" },
  zumper: { label: "Zumper" },
  livrent: { label: "liv.rent" },
  "rentals-ca": { label: "rentals.ca" },
  facebook: { label: "Facebook Marketplace", note: "best effort" },
};

export function sourceFromKey(key: ScraperKey): Source {
  return key.startsWith("apify:") ? (key.slice("apify:".length) as Source) : (key as Source);
}

export function sourceLabel(source: string): string {
  return SOURCE_INFO[source as Source]?.label ?? source;
}

export function configuredSourcesForCity(city: CityId): Array<{ source: Source; label: string; note?: string }> {
  const seen = new Set<Source>();
  const sources = [];
  for (const key of CITIES[city].sources) {
    const source = sourceFromKey(key);
    if (seen.has(source)) continue;
    seen.add(source);
    const info = SOURCE_INFO[source];
    sources.push({ source, label: info?.label ?? source, note: info?.note });
  }
  return sources;
}

export function sourceListLabel(city: CityId): string {
  return configuredSourcesForCity(city).map((source) => source.label).join(", ");
}
