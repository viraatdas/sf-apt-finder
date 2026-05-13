import "dotenv/config";
import postgres from "postgres";
import { sendDailyDigest } from "../lib/email";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const rows = await sql`
    SELECT id, title, price, neighborhood,
      (sources->0->>'source') AS src,
      (sources->0->>'url') AS url
    FROM listings
    WHERE status='available'
      AND jsonb_array_length(coalesce(photo_urls,'[]'::jsonb))>0
    ORDER BY last_seen_at DESC
    LIMIT 100`;
  const newListings = rows.slice(0, 13).map((r: any) => ({
    id: r.id,
    title: r.title,
    price: r.price,
    neighborhood: r.neighborhood,
    url: r.url,
  }));
  const perSource: any = {};
  for (const r of rows.slice(0, 13)) {
    perSource[r.src] = { raw: (perSource[r.src]?.raw ?? 0) + 1 };
  }
  await sendDailyDigest(
    {
      totalRaw: rows.length,
      totalMerged: rows.length,
      newCount: newListings.length,
      updatedCount: 0,
      unavailableCount: 0,
      perSource,
      newListings,
    } as any,
    process.env.SITE_URL ?? "https://apt-tinder.viraat.dev"
  );
  await sql.end();
  console.log("✔ test email sent");
}
main().catch((e) => { console.error(e); process.exit(1); });
