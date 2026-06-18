import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { activeCities, cityFromParam, isCityId, type CityId } from "@/lib/cities";
import { db, schema } from "@/lib/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Midnight availability re-check. For each `available` listing, fetch its
 * primary source URL. If we get a 404/410, or the page body contains a
 * "deleted / no longer available" marker, flip status → unavailable.
 *
 * Soft errors (403, 429, network timeout) are IGNORED so we don't mass-mark
 * unavailable just because a source temporarily blocked us. The longer-term
 * "not seen for 3 days" sweep in the scrape orchestrator covers those.
 */

const CONCURRENCY = 12;
const FETCH_TIMEOUT_MS = 6000;

/** Per-source signals that a listing has been removed. */
const REMOVED_TEXT_HINTS = [
  "this posting has been deleted",
  "this posting has been flagged",
  "page not found",
  "listing not found",
  "no longer available",
  "no longer being advertised",
  "the page you requested could not be found",
  "we couldn't find what you were looking for",
  "rental is no longer available",
  "this rental is unavailable",
];

interface VerifyResult {
  url: string;
  outcome: "available" | "unavailable" | "skip";
  reason?: string;
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const url = new URL(req.url);
  const requestedCity = url.searchParams.get("city");
  const cities = isCityId(requestedCity) ? [cityFromParam(requestedCity)] : activeCities();
  const results = [];

  for (const city of cities) {
    results.push(await verifyCity(city, start));
    if (Date.now() - start > 55_000) break;
  }

  return NextResponse.json({
    ok: true,
    cities: results,
    durationMs: Date.now() - start,
  });
}

export const POST = GET;

async function verifyCity(city: CityId, start: number) {
  const rows = await db
    .select({
      id: schema.listings.id,
      sources: schema.listings.sources,
    })
    .from(schema.listings)
    .where(and(eq(schema.listings.status, "available"), eq(schema.listings.city, city)));

  const items: Array<{ id: string; url: string }> = [];
  for (const r of rows) {
    const url = (r.sources as any[] | null)?.[0]?.url;
    if (url) items.push({ id: r.id, url });
  }

  let checked = 0;
  let markedUnavailable = 0;
  let confirmedAvailable = 0;
  let skipped = 0;
  const unavailableIds: string[] = [];

  // Concurrency-limited verification
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        // Stop if we're approaching the function timeout
        if (Date.now() - start > 50_000) return;
        const it = items[i];
        const result = await verifyOne(it.url);
        checked++;
        if (result.outcome === "unavailable") {
          markedUnavailable++;
          unavailableIds.push(it.id);
        } else if (result.outcome === "available") {
          confirmedAvailable++;
        } else {
          skipped++;
        }
      }
    })
  );

  // Bulk update unavailable
  if (unavailableIds.length) {
    // Drizzle's inArray for many IDs — chunk to keep param count sane
    const chunks: string[][] = [];
    for (let i = 0; i < unavailableIds.length; i += 200) {
      chunks.push(unavailableIds.slice(i, i + 200));
    }
    for (const c of chunks) {
      await db
        .update(schema.listings)
        .set({ status: "unavailable", unavailableAt: new Date() })
        .where(
          and(
            eq(schema.listings.status, "available"),
            eq(schema.listings.city, city),
            inArray(schema.listings.id, c)
          )
        );
    }
  }

  return {
    city,
    totalAvailable: items.length,
    checked,
    confirmedAvailable,
    markedUnavailable,
    skipped,
  };
}

async function verifyOne(url: string): Promise<VerifyResult> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    // Hard delete signals
    if (res.status === 404 || res.status === 410) {
      return { url, outcome: "unavailable", reason: `HTTP ${res.status}` };
    }
    // Block signals — be conservative, skip
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      return { url, outcome: "skip", reason: `HTTP ${res.status}` };
    }
    // 200 — peek at body for "removed" markers (don't pull megabytes)
    const text = await res.text();
    const lower = text.toLowerCase().slice(0, 20000); // first 20k chars is plenty
    for (const hint of REMOVED_TEXT_HINTS) {
      if (lower.includes(hint)) {
        return { url, outcome: "unavailable", reason: `hint:${hint.slice(0, 30)}` };
      }
    }
    return { url, outcome: "available" };
  } catch (err: any) {
    // Timeouts / network errors → skip (don't penalize)
    return { url, outcome: "skip", reason: err?.message ?? "fetch error" };
  }
}
