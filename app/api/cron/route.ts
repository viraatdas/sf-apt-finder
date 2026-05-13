import { NextRequest, NextResponse } from "next/server";
import { runAllScrapers } from "@/lib/scrapers";
import { sendDailyDigest } from "@/lib/email";

export const maxDuration = 300; // 5 minutes (Vercel Pro). Hobby is 60s — see README.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runAllScrapers();
  const siteUrl = process.env.SITE_URL ?? "https://apt-tinder.viraat.dev";
  await sendDailyDigest(result, siteUrl);

  return NextResponse.json({
    ok: true,
    newCount: result.newCount,
    updatedCount: result.updatedCount,
    totalRaw: result.totalRaw,
    totalMerged: result.totalMerged,
    perSource: result.perSource,
  });
}

// Allow manual trigger via POST for testing.
export const POST = GET;
