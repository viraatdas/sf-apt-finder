import { NextRequest, NextResponse } from "next/server";
import { cityFromParam, maxPriceFromParam } from "@/lib/cities";
import { sourceFromParam } from "@/lib/sources";
import { listAvailableListings, listLikedListings, listSwipeListings } from "@/lib/listings/query";
import { userIdFromRequest } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = userIdFromRequest(req, url.searchParams.get("userId"));
  const mode = url.searchParams.get("mode") ?? "swipe"; // swipe | liked | all
  const city = cityFromParam(url.searchParams.get("city"));
  const maxPrice = maxPriceFromParam(city, url.searchParams.get("maxPrice"));
  const source = sourceFromParam(city, url.searchParams.get("source"));
  const includeUnavailable = url.searchParams.get("includeUnavailable") === "1";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);
  const filters = { city, maxPrice, source, includeUnavailable };

  if (mode === "liked") {
    const rows = await listLikedListings(filters, userId, limit);
    return NextResponse.json({ listings: rows });
  }

  const rows = mode === "all"
    ? await listAvailableListings(filters, limit)
    : await listSwipeListings(filters, userId, limit);

  return NextResponse.json({ listings: rows });
}
