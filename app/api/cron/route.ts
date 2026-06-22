import { NextRequest, NextResponse } from "next/server";
import { runAllScrapers } from "@/lib/scrapers";
import { sendDailyDigest } from "@/lib/email";
import { activeCities, contextDefaults, isCityId, type CityId } from "@/lib/cities";
import { formatScrapeProgress } from "@/lib/scrapers/progress";

export const maxDuration = 300; // 5 minutes.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Optional ?city=<id> restricts the run to a single city (and sends only that
  // city's digest). Defaults to all active cities.
  const cityParam = req.nextUrl.searchParams.get("city");
  const onlyCity = cityParam && isCityId(cityParam) ? cityParam : undefined;

  if (req.nextUrl.searchParams.get("json") === "1") {
    const result = await runCron((message) => console.log(message), onlyCity);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (message: string) => {
        controller.enqueue(encoder.encode(`${new Date().toISOString()} ${message}\n`));
      };
      const result = await runCron(write, onlyCity);
      write(`summary ${JSON.stringify(result)}`);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function runCron(write: (message: string) => void, onlyCity?: CityId) {
  const siteUrl = process.env.SITE_URL ?? "https://apt-tinder.viraat.dev";
  const cities = onlyCity ? [onlyCity] : activeCities();
  const results = [];
  let ok = true;

  for (const city of cities) {
    write(`city ${city} starting`);
    try {
      const result = await runAllScrapers(contextDefaults(city), {
        onProgress: (event) => write(formatScrapeProgress(event)),
      });
      write(`city ${city} emailing digest`);
      await sendDailyDigest(result, siteUrl, city);
      write(`city ${city} digest sent`);
      results.push({
        city,
        newCount: result.newCount,
        updatedCount: result.updatedCount,
        unavailableCount: result.unavailableCount,
        totalRaw: result.totalRaw,
        totalMerged: result.totalMerged,
        perSource: result.perSource,
      });
    } catch (err) {
      ok = false;
      const error = err instanceof Error ? err.message : String(err);
      write(`city ${city} error ${error}`);
      results.push({ city, error });
    }
  }

  return {
    ok,
    cities: results,
  };
}

// Allow manual trigger via POST for testing.
export const POST = GET;
