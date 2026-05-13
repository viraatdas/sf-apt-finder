import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { listingId, decision, userId = "household" } = body ?? {};
  if (!listingId || !["yes", "no", "maybe"].includes(decision)) {
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
  const userId = url.searchParams.get("userId") ?? "household";
  if (!listingId) return NextResponse.json({ error: "bad request" }, { status: 400 });
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
