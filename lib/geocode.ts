/**
 * Geocoding via OpenStreetMap Nominatim. Free, 1 req/sec limit.
 * For batch jobs we space requests out. Cached in-memory per process.
 */

const cache = new Map<string, { lat: number; lng: number } | null>();
let lastCall = 0;

async function rateLimit() {
  const now = Date.now();
  const delta = now - lastCall;
  if (delta < 1100) await new Promise((r) => setTimeout(r, 1100 - delta));
  lastCall = Date.now();
}

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = address.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;
  await rateLimit();
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${address}, San Francisco, CA`);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    const res = await fetch(url, {
      headers: { "User-Agent": "sf-apt-finder/0.1 (viraat@exla.ai)" },
    });
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) {
      cache.set(key, null);
      return null;
    }
    const out = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    cache.set(key, out);
    return out;
  } catch {
    cache.set(key, null);
    return null;
  }
}
