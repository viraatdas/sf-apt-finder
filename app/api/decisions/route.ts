import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { userIdFromRequest } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { listingId, decision } = body ?? {};
  const userId = userIdFromRequest(req, body?.userId);
  if (!listingId || !userId || !["yes", "no", "maybe"].includes(decision)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  await db
    .insert(schema.decisions)
    .values({ listingId, decision, userId })
    .onConflictDoUpdate({
      target: [schema.decisions.userId, schema.decisions.listingId],
      set: { decision, createdAt: new Date() },
    });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const listingId = url.searchParams.get("listingId");
  const userId = userIdFromRequest(req, url.searchParams.get("userId"));
  if (!listingId || !userId) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await db
    .delete(schema.decisions)
    .where(
      and(
        eq(schema.decisions.listingId, listingId),
        eq(schema.decisions.userId, userId)
      )
    );
  return NextResponse.json({ ok: true });
}
