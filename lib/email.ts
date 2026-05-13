import { Resend } from "resend";
import { db, schema } from "@/lib/db";
import { desc, inArray } from "drizzle-orm";
import type { ScrapeResult } from "./scrapers";

const FROM = process.env.EMAIL_FROM ?? "SF Apt Finder <onboarding@resend.dev>";
const TO = (process.env.EMAIL_TO ?? "viraat.laldas@gmail.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

interface Featured {
  id: string;
  title: string;
  price: number;
  neighborhood: string | null;
  photo: string | null;
  url: string;
  source: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  addressLine: string | null;
}

export async function sendDailyDigest(result: ScrapeResult, siteUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set; skipping email");
    return;
  }
  if (result.newCount === 0) {
    console.log("no new listings; skipping email");
    return;
  }
  const resend = new Resend(apiKey);

  // Load full listing rows for the new ones so we can build featured cards.
  const newIds = result.newListings.map((l) => l.id);
  const fullRows = newIds.length
    ? await db
        .select()
        .from(schema.listings)
        .where(inArray(schema.listings.id, newIds))
        .orderBy(desc(schema.listings.firstSeenAt))
    : [];

  // Pick 3 featured: prefer different sources, prefer listings with photos+area.
  const featured = pickFeatured(fullRows);

  // Group remaining by neighborhood
  const grouped = new Map<string, ScrapeResult["newListings"]>();
  for (const l of result.newListings) {
    if (featured.some((f) => f.id === l.id)) continue;
    const k = l.neighborhood ?? "Unknown area";
    const arr = grouped.get(k) ?? [];
    arr.push(l);
    grouped.set(k, arr);
  }
  const groups = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);

  const html = renderHtml(result, featured, groups, siteUrl);
  const text = renderText(result, featured, groups, siteUrl);

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: TO,
    subject: `🏠 ${result.newCount} new SF apartments today`,
    html,
    text,
  });
  if (error) {
    console.error("resend send failed:", error);
  } else {
    console.log("resend send ok:", data?.id);
  }
}

function pickFeatured(rows: (typeof schema.listings.$inferSelect)[]): Featured[] {
  if (!rows.length) return [];

  const score = (r: typeof schema.listings.$inferSelect) => {
    let s = 0;
    if ((r.photoUrls as string[] | null)?.length) s += 5;
    if (r.neighborhood) s += 3;
    if (r.lat && r.lng) s += 2;
    if (r.bathrooms != null) s += 1;
    if (r.sqft) s += 1;
    if (r.description) s += 1;
    return s;
  };

  const sorted = [...rows].sort((a, b) => score(b) - score(a));

  // Greedy pick: take best, then prefer different source for next picks.
  const picks: typeof schema.listings.$inferSelect[] = [];
  const usedSources = new Set<string>();
  for (const r of sorted) {
    if (picks.length >= 3) break;
    const src = ((r.sources as any[] | null)?.[0]?.source as string) ?? "x";
    if (usedSources.has(src) && picks.length < sorted.length / 2) continue;
    picks.push(r);
    usedSources.add(src);
  }
  // Top up if we under-filled
  for (const r of sorted) {
    if (picks.length >= 3) break;
    if (!picks.includes(r)) picks.push(r);
  }

  return picks.map((r): Featured => {
    const photos = (r.photoUrls as string[] | null) ?? [];
    const sources = (r.sources as any[] | null) ?? [];
    return {
      id: r.id,
      title: r.title,
      price: r.price ?? 0,
      neighborhood: r.neighborhood,
      photo: photos[0] ?? null,
      url: sources[0]?.url ?? "",
      source: sources[0]?.source ?? "?",
      bedrooms: r.bedrooms,
      bathrooms: r.bathrooms,
      sqft: r.sqft,
      addressLine: r.addressLine,
    };
  });
}

function renderText(
  result: ScrapeResult,
  featured: Featured[],
  groups: Array<[string, ScrapeResult["newListings"]]>,
  siteUrl: string
): string {
  const lines: string[] = [];
  lines.push(`${result.newCount} new SF apartments today.`);
  lines.push(`Swipe: ${siteUrl}\n`);
  if (featured.length) {
    lines.push("== Featured ==");
    for (const f of featured) {
      lines.push(`  $${f.price.toLocaleString()} · ${f.neighborhood ?? "—"} · ${f.source}`);
      lines.push(`    ${f.title}`);
      lines.push(`    ${f.url}\n`);
    }
  }
  for (const [hood, items] of groups) {
    lines.push(`== ${hood} (${items.length}) ==`);
    for (const it of items) {
      lines.push(`  $${it.price.toLocaleString()} — ${it.title}`);
      lines.push(`    ${it.url}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderHtml(
  result: ScrapeResult,
  featured: Featured[],
  groups: Array<[string, ScrapeResult["newListings"]]>,
  siteUrl: string
): string {
  const featuredHtml = featured.length
    ? featured.map((f) => renderFeatured(f)).join("")
    : "";

  const groupsHtml = groups
    .map(([hood, items]) => {
      const rows = items
        .map(
          (it) => `
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font:14px -apple-system,sans-serif">
          <a href="${it.url}" style="color:#0a0a0c;text-decoration:none">
            <strong>$${it.price.toLocaleString()}</strong>
            <span style="color:#888"> · ${escape(it.title)}</span>
          </a>
        </td></tr>`
        )
        .join("");
      return `
      <h3 style="font:600 15px -apple-system,sans-serif;margin:24px 0 8px;color:#0a0a0c">
        📍 ${escape(hood)} <span style="color:#999;font-weight:400;font-size:13px">· ${items.length}</span>
      </h3>
      <table style="width:100%;border-collapse:collapse">${rows}</table>`;
    })
    .join("");

  return `<!doctype html>
  <html><body style="background:#fafaf9;margin:0;padding:24px;color:#0a0a0c;font-family:-apple-system,sans-serif">
    <div style="max-width:680px;margin:0 auto">
      <div style="background:#fff;border:1px solid #eee;border-radius:20px;padding:32px;margin-bottom:16px">
        <h1 style="font:600 28px ui-serif,Georgia,serif;margin:0 0 4px;letter-spacing:-0.5px">
          🏠 ${result.newCount} new SF apartments
        </h1>
        <p style="color:#666;font-size:14px;margin:0 0 24px">
          ${result.totalRaw} scraped → ${result.totalMerged} deduped across ${Object.keys(result.perSource).filter((s) => result.perSource[s as keyof typeof result.perSource]?.raw).length} sources
        </p>
        <a href="${siteUrl}" style="display:inline-block;background:#0a0a0c;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">
          Swipe through them →
        </a>
      </div>

      ${featuredHtml ? `
      <div style="margin:0 0 24px">
        <h2 style="font:600 16px -apple-system,sans-serif;margin:0 0 12px;color:#0a0a0c">
          ⭐ Featured today
        </h2>
        ${featuredHtml}
      </div>` : ""}

      ${groupsHtml ? `
      <div style="background:#fff;border:1px solid #eee;border-radius:20px;padding:24px">
        <h2 style="font:600 16px -apple-system,sans-serif;margin:0 0 4px;color:#0a0a0c">
          All new finds by area
        </h2>
        ${groupsHtml}
      </div>` : ""}

      <p style="margin-top:24px;color:#999;font-size:12px;text-align:center">
        apt-tinder · daily at 7:05 AM PT
      </p>
    </div>
  </body></html>`;
}

function renderFeatured(f: Featured): string {
  const specs: string[] = [];
  if (f.bedrooms != null) specs.push(`${f.bedrooms} bd`);
  if (f.bathrooms != null) specs.push(`${f.bathrooms} ba`);
  if (f.sqft) specs.push(`${f.sqft.toLocaleString()} sqft`);

  const img = f.photo
    ? `<img src="${f.photo}" alt="" style="width:100%;height:200px;object-fit:cover;display:block">`
    : `<div style="width:100%;height:200px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:48px;color:#ccc">🏠</div>`;

  return `
    <a href="${f.url}" style="display:block;text-decoration:none;color:#0a0a0c;margin-bottom:12px">
      <div style="background:#fff;border:1px solid #eee;border-radius:16px;overflow:hidden">
        ${img}
        <div style="padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px">
            <div style="font:700 22px ui-serif,Georgia,serif">$${f.price.toLocaleString()}<span style="font-size:13px;color:#888;font-weight:400"> /mo</span></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
              ${f.neighborhood ? `<span style="background:#0a0a0c;color:#fff;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600">📍 ${escape(f.neighborhood)}</span>` : ""}
              <span style="background:#f0f0f0;color:#666;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600">${escape(f.source)}</span>
            </div>
          </div>
          <div style="font-size:13px;color:#444;line-height:1.4;margin-bottom:6px">${escape(f.title)}</div>
          ${f.addressLine ? `<div style="font-size:12px;color:#888;margin-bottom:6px">${escape(f.addressLine)}</div>` : ""}
          ${specs.length ? `<div style="font-size:12px;color:#666">${specs.join(" · ")}</div>` : ""}
        </div>
      </div>
    </a>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
