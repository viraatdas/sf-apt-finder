import { NextRequest, NextResponse } from "next/server";
import { runAllScrapers } from "@/lib/scrapers";
import { sendDailyDigest } from "@/lib/email";
import { activeCities, contextDefaults } from "@/lib/cities";

export const maxDuration = 300; // 5 minutes (Vercel Pro). Hobby is 60s — see README.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const siteUrl = process.env.SITE_URL ?? "https://apt-tinder.viraat.dev";
  const cities = activeCities();
  const results = [];

  for (const city of cities) {
    const result = await runAllScrapers(contextDefaults(city));
    await sendDailyDigest(result, siteUrl, city);
    results.push({
      city,
      newCount: result.newCount,
      updatedCount: result.updatedCount,
      totalRaw: result.totalRaw,
      totalMerged: result.totalMerged,
      perSource: result.perSource,
    });
  }

  return NextResponse.json({
    ok: true,
    cities: results,
  });
}

// Allow manual trigger via POST for testing.
export const POST = GET;
