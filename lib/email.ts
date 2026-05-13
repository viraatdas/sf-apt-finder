import { Resend } from "resend";
import { db, schema } from "@/lib/db";
import { desc, inArray } from "drizzle-orm";
import type { ScrapeResult } from "./scrapers";

const FROM = process.env.EMAIL_FROM ?? "SF Apt Finder <onboarding@resend.dev>";
const TO = (process.env.EMAIL_TO ?? "viraat.laldas@gmail.com,sambruns2000@gmail.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MORE_LIMIT = 10;

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
  contactPhone: string | null;
  contactEmail: string | null;
  contactName: string | null;
}

interface MoreItem {
  id: string;
  title: string;
  price: number;
  neighborhood: string | null;
  photo: string | null;
  url: string;
  source: string;
  bedrooms: number | null;
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

  // Load full rows for all of today's new IDs.
  const newIds = result.newListings.map((l) => l.id);
  const fullRows = newIds.length
    ? await db
        .select()
        .from(schema.listings)
        .where(inArray(schema.listings.id, newIds))
        .orderBy(desc(schema.listings.firstSeenAt))
    : [];

  const featured = pickFeatured(fullRows);
  const more = pickMore(fullRows, featured);

  const html = renderHtml(result, featured, more, siteUrl);
  const text = renderText(result, featured, more, siteUrl);

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

/** Score: photos > area > coords > bath/sqft/description. */
function score(r: typeof schema.listings.$inferSelect): number {
  let s = 0;
  if ((r.photoUrls as string[] | null)?.length) s += 8;
  if ((r.photoUrls as string[] | null)?.length && (r.photoUrls as string[]).length > 1) s += 3;
  if (r.neighborhood) s += 4;
  if (r.lat && r.lng) s += 2;
  if (r.bathrooms != null) s += 1;
  if (r.sqft) s += 1;
  if (r.description) s += 1;
  return s;
}

function sourceOf(r: typeof schema.listings.$inferSelect): string {
  return ((r.sources as any[] | null)?.[0]?.source as string) ?? "unknown";
}

/** Pick 3 featured — STRICTLY from different sources when possible. */
function pickFeatured(rows: (typeof schema.listings.$inferSelect)[]): Featured[] {
  if (!rows.length) return [];
  // Group by source; pick the highest-scored from each
  const bySource = new Map<string, typeof schema.listings.$inferSelect>();
  for (const r of rows) {
    if (!((r.photoUrls as string[] | null)?.length)) continue; // featured MUST have a photo
    const src = sourceOf(r);
    const prev = bySource.get(src);
    if (!prev || score(r) > score(prev)) bySource.set(src, r);
  }
  // Pick top 3 sources by their best listing score, in this preferred order
  const preferredOrder = ["zillow", "apartments-com", "trulia", "padmapper", "craigslist", "hotpads"];
  const picks: typeof schema.listings.$inferSelect[] = [];
  for (const src of preferredOrder) {
    if (picks.length >= 3) break;
    const candidate = bySource.get(src);
    if (candidate) picks.push(candidate);
  }
  // Top up from any remaining sources if we have fewer than 3
  for (const [src, candidate] of bySource) {
    if (picks.length >= 3) break;
    if (!picks.some((p) => sourceOf(p) === src)) picks.push(candidate);
  }
  // If we STILL have <3 (only one source today), take more from that source by score
  if (picks.length < 3) {
    const remaining = rows
      .filter((r) => !picks.includes(r))
      .sort((a, b) => score(b) - score(a));
    for (const r of remaining) {
      if (picks.length >= 3) break;
      picks.push(r);
    }
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
      contactPhone: r.contactPhone,
      contactEmail: r.contactEmail,
      contactName: r.contactName,
    };
  });
}

/** Up to 10 additional listings (excluding featured), sorted by score. */
function pickMore(
  rows: (typeof schema.listings.$inferSelect)[],
  featured: Featured[]
): MoreItem[] {
  const featuredIds = new Set(featured.map((f) => f.id));
  return rows
    .filter((r) => !featuredIds.has(r.id))
    .sort((a, b) => score(b) - score(a))
    .slice(0, MORE_LIMIT)
    .map((r): MoreItem => {
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
      };
    });
}

function renderText(
  result: ScrapeResult,
  featured: Featured[],
  more: MoreItem[],
  siteUrl: string
): string {
  const lines: string[] = [];
  lines.push(`🏠 ${result.newCount} new SF apartments today`);
  lines.push(`→ ${siteUrl}\n`);
  if (featured.length) {
    lines.push("== Featured ==");
    for (const f of featured) {
      lines.push(`  $${f.price.toLocaleString()} · ${f.neighborhood ?? "—"} · ${f.source}`);
      lines.push(`    ${f.title}`);
      lines.push(`    ${f.url}\n`);
    }
  }
  if (more.length) {
    lines.push(`== ${more.length} more ==`);
    for (const it of more) {
      lines.push(`  $${it.price.toLocaleString()} · ${it.neighborhood ?? "—"} · ${it.source} · ${it.title}`);
    }
    lines.push("");
  }
  lines.push(`→ View all ${result.newCount} at ${siteUrl}`);
  return lines.join("\n");
}

function renderHtml(
  result: ScrapeResult,
  featured: Featured[],
  more: MoreItem[],
  siteUrl: string
): string {
  const featuredHtml = featured.length
    ? featured.map((f) => renderFeatured(f)).join("")
    : "";

  const moreHtml = more.length
    ? `
    <h2 style="font:600 16px -apple-system,sans-serif;margin:32px 0 12px 4px;color:#0a0a0c">
      Also new today
    </h2>
    <table style="width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid #eee;border-radius:16px;overflow:hidden">
      ${more.map((it, i) => renderRow(it, i === more.length - 1)).join("")}
    </table>` : "";

  return `<!doctype html>
  <html><body style="background:#f5f5f4;margin:0;padding:24px;color:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
    <div style="max-width:680px;margin:0 auto">

      <!-- HERO: count + big CTA -->
      <div style="background:#0a0a0c;color:#fff;border-radius:24px;padding:32px;margin-bottom:20px">
        <div style="font:600 12px ui-monospace,monospace;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:8px">
          ${todayLabel()}
        </div>
        <h1 style="font:600 36px ui-serif,Georgia,serif;margin:0 0 6px;letter-spacing:-0.6px;line-height:1.05">
          ${result.newCount} new
        </h1>
        <div style="font:600 36px ui-serif,Georgia,serif;margin:0 0 20px;letter-spacing:-0.6px;line-height:1.05;color:#a8a29e">
          SF apartments to review
        </div>
        <a href="${siteUrl}"
           style="display:inline-block;background:#fff;color:#0a0a0c;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px">
          Swipe through them →
        </a>
        <div style="margin-top:14px;color:#888;font-size:12px">
          ${result.totalRaw} scraped → ${result.totalMerged} deduped across ${Object.keys(result.perSource).filter((s) => result.perSource[s as keyof typeof result.perSource]?.raw).length} sites
        </div>
      </div>

      ${featuredHtml ? `
      <div>
        <h2 style="font:600 16px -apple-system,sans-serif;margin:8px 0 14px 4px;color:#0a0a0c">
          ⭐ Featured — one from each site
        </h2>
        ${featuredHtml}
      </div>` : ""}

      ${moreHtml}

      <!-- BOTTOM CTA -->
      <div style="text-align:center;margin:32px 0 8px">
        <a href="${siteUrl}"
           style="display:inline-block;background:#0a0a0c;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px">
          View all ${result.newCount} on apt-tinder →
        </a>
      </div>

      <p style="margin-top:24px;color:#999;font-size:12px;text-align:center">
        apt-tinder · daily at 7:05 AM PT · sent to ${TO.length} ${TO.length === 1 ? "person" : "people"}
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
    ? `<img src="${f.photo}" alt="" style="width:100%;height:240px;object-fit:cover;display:block">`
    : `<div style="width:100%;height:240px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:60px;color:#ccc">🏠</div>`;

  return `
    <a href="${f.url}" style="display:block;text-decoration:none;color:#0a0a0c;margin-bottom:14px">
      <div style="background:#fff;border:1px solid #eee;border-radius:18px;overflow:hidden">
        ${img}
        <div style="padding:16px 18px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px">
            <div style="font:700 24px ui-serif,Georgia,serif">$${f.price.toLocaleString()}<span style="font-size:13px;color:#888;font-weight:400"> /mo</span></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
              ${f.neighborhood ? `<span style="background:#0a0a0c;color:#fff;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600">📍 ${escape(f.neighborhood)}</span>` : ""}
              <span style="background:#ec4899;color:#fff;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600">${escape(f.source)}</span>
            </div>
          </div>
          <div style="font-size:13px;color:#444;line-height:1.4;margin-bottom:6px">${escape(f.title)}</div>
          ${f.addressLine ? `<div style="font-size:12px;color:#888;margin-bottom:6px">${escape(f.addressLine)}</div>` : ""}
          ${specs.length ? `<div style="font-size:12px;color:#666;font-weight:600;margin-bottom:8px">${specs.join(" · ")}</div>` : ""}
          ${renderContactInline(f)}
        </div>
      </div>
    </a>`;
}

function renderContactInline(f: Featured): string {
  const bits: string[] = [];
  if (f.contactName) bits.push(`<span style="color:#0a0a0c;font-weight:600">${escape(f.contactName)}</span>`);
  if (f.contactPhone) {
    const tel = f.contactPhone.replace(/\D/g, "");
    bits.push(`<a href="tel:${tel}" style="color:#0a0a0c;text-decoration:none;font-family:ui-monospace,monospace">📞 ${escape(f.contactPhone)}</a>`);
  }
  if (f.contactEmail) {
    bits.push(`<a href="mailto:${escape(f.contactEmail)}" style="color:#0a0a0c;text-decoration:none;font-family:ui-monospace,monospace">✉ ${escape(f.contactEmail)}</a>`);
  }
  if (!bits.length) return "";
  return `<div style="margin-top:6px;padding:8px 10px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;font-size:12px;display:flex;flex-wrap:wrap;gap:8px;">${bits.join('<span style="color:#999">·</span>')}</div>`;
}

function renderRow(it: MoreItem, isLast: boolean): string {
  const thumb = it.photo
    ? `<img src="${it.photo}" alt="" width="64" height="64" style="width:64px;height:64px;object-fit:cover;border-radius:10px;display:block">`
    : `<div style="width:64px;height:64px;background:#f0f0f0;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;color:#ccc">🏠</div>`;
  const border = isLast ? "" : "border-bottom:1px solid #f0f0f0;";
  return `
    <tr>
      <td style="padding:10px 16px;${border}">
        <a href="${it.url}" style="text-decoration:none;color:#0a0a0c;display:block">
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="width:64px;padding-right:14px;vertical-align:middle">${thumb}</td>
              <td style="vertical-align:middle">
                <div style="font:700 17px -apple-system,sans-serif;margin-bottom:2px">$${it.price.toLocaleString()}<span style="font-size:12px;color:#888;font-weight:400"> /mo</span></div>
                <div style="font-size:12px;color:#555;line-height:1.35;margin-bottom:2px">${escape(it.title).slice(0, 90)}</div>
                <div style="font-size:11px;color:#888">
                  ${it.neighborhood ? `📍 ${escape(it.neighborhood)} · ` : ""}${escape(it.source)}
                </div>
              </td>
            </tr>
          </table>
        </a>
      </td>
    </tr>`;
}

function todayLabel(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
