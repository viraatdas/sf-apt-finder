import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { CITIES, DEFAULT_CITY, type CityId } from "@/lib/cities";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(n: number | null | undefined, city: CityId = DEFAULT_CITY): string {
  if (n == null) return "N/A";
  const value = CITIES[city].currencySymbol + n.toLocaleString();
  return CITIES[city].currency === "CAD" ? `${value} CAD` : value;
}

export function normalizeDisplayText(value: string | null | undefined): string {
  return (value ?? "").replace(/[\u2013\u2014]/g, "-");
}

/**
 * Most sources hand us a small, downscaled thumbnail in their listing feed even
 * though a full-resolution version is reachable by tweaking the URL. We render
 * those upscaled at display time so the photos match the source site's quality
 * (no re-scrape needed; falls back to the original URL on any surprise).
 */
export function upgradePhotoUrl(url: string | null | undefined): string {
  if (!url) return url ?? "";
  try {
    // Craigslist: any size token -> 1200x900 (the max it serves).
    if (url.includes("images.craigslist.org")) {
      return url.replace(/_\d+x\d+\.jpg/i, "_1200x900.jpg");
    }
    // Zillow static: small fixed-size suffix (e.g. -p_e) -> large content-fit.
    if (url.includes("photos.zillowstatic.com")) {
      return url.replace(/-[a-z0-9_]+\.(jpg|jpeg|webp|png)$/i, "-cc_ft_1536.$1");
    }
    // Zumper CDN: query params downscale a native ~1280px image -> request large.
    if (url.includes("zumpercdn.com")) {
      return `${url.split("?")[0]}?w=1080&q=90`;
    }
    // Kijiji: the `rule` param picks the size bucket.
    if (url.includes("media.kijiji.ca")) {
      return url.replace(/rule=kijijica-\d+-jpg/i, "rule=kijijica-1600-jpg");
    }
    return url;
  } catch {
    return url;
  }
}
