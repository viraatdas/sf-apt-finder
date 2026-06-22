import Link from "next/link";
import { Bed, Bath, Maximize2, MapPin, ExternalLink } from "lucide-react";
import { cityFromParam, maxPriceFromParam, type CityId } from "@/lib/cities";
import { SourceStrip } from "@/components/source-strip";
import { sourceFromParam, sourceLabel } from "@/lib/sources";
import { formatMoney, normalizeDisplayText, upgradePhotoUrl } from "@/lib/utils";
import { countMatchingListings, listLikedListings, type LikedListingRow } from "@/lib/listings/query";
import { currentUserId } from "@/lib/server-user";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<{ city?: string; maxPrice?: string; source?: string }>;
};

export default async function LikedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const city = cityFromParam(params.city);
  const maxPrice = maxPriceFromParam(city, params.maxPrice);
  const source = sourceFromParam(city, params.source);
  let rows: LikedListingRow[] = [];
  let matchingCount = 0;
  try {
    const filters = { city, maxPrice, source };
    const userId = await currentUserId();
    [matchingCount, rows] = await Promise.all([
      countMatchingListings(filters),
      listLikedListings(filters, userId),
    ]);
  } catch (err) {
    console.warn("DB read failed", err);
  }

  const groups = {
    yes: rows.filter((r) => r.decision === "yes"),
    maybe: rows.filter((r) => r.decision === "maybe"),
    no: rows.filter((r) => r.decision === "no"),
  };

  return (
    <>
      <SourceStrip
        city={city}
        matchingCount={matchingCount}
        maxPrice={maxPrice}
        activeSource={source}
        basePath="/liked"
        className="pt-4"
      />
      <div className="max-w-[1900px] mx-auto p-4 lg:p-8">
        <h1 className="font-display text-3xl mb-2">Shortlist</h1>
        <p className="text-sm text-ink-900/60 mb-8">
          {groups.yes.length} loved · {groups.maybe.length} maybe · {groups.no.length} passed
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Column
            title="Loved"
            emoji="❤️"
            rows={groups.yes}
            city={city}
            maxPrice={maxPrice}
            color="text-accent-yes"
            accent="border-accent-yes/50"
          />
          <Column
            title="Maybe"
            emoji="🤔"
            rows={groups.maybe}
            city={city}
            maxPrice={maxPrice}
            color="text-amber-600"
            accent="border-accent-maybe/50"
          />
          <Column
            title="Passed"
            emoji="🚫"
            rows={groups.no}
            city={city}
            maxPrice={maxPrice}
            color="text-accent-no"
            accent="border-accent-no/30"
          />
        </div>
      </div>
    </>
  );
}

function Column({
  title,
  emoji,
  color,
  accent,
  rows,
  city,
  maxPrice,
}: {
  title: string;
  emoji: string;
  color: string;
  accent: string;
  rows: LikedListingRow[];
  city: CityId;
  maxPrice: number;
}) {
  return (
    <div>
      <h2 className={`font-display text-2xl mb-4 ${color} flex items-center gap-2`}>
        <span>{emoji} {title}</span>
        <span className="text-ink-900/40 text-base font-sans font-normal">{rows.length}</span>
      </h2>
      <div className="space-y-4">
        {rows.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-ink-100 p-8 text-center">
            <p className="text-sm text-ink-900/40">Nothing here yet</p>
          </div>
        )}
        {rows.map((r) => (
          <ListingCard key={r.listing.id} row={r} accent={accent} city={city} maxPrice={maxPrice} />
        ))}
      </div>
    </div>
  );
}

function ListingCard({
  row,
  accent,
  city,
  maxPrice,
}: {
  row: LikedListingRow;
  accent: string;
  city: CityId;
  maxPrice: number;
}) {
  const { listing } = row;
  const photos = (listing.photoUrls as string[] | null) ?? [];
  const sources = (listing.sources as any[] | null) ?? [];
  const stale = listing.status === "unavailable";
  const photo = photos[0];

  function sourceFilterHref(source: string) {
    const params = new URLSearchParams();
    params.set("city", city);
    params.set("maxPrice", String(maxPrice));
    params.set("source", source);
    return `/liked?${params.toString()}`;
  }

  return (
    <div
      className={
        "rounded-2xl bg-white border " +
        accent +
        " overflow-hidden hover:shadow-lg transition " +
        (stale ? "opacity-60" : "")
      }
    >
      {/* Image */}
      <div className="relative aspect-[16/10] bg-ink-100">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={upgradePhotoUrl(photo)}
            alt={normalizeDisplayText(listing.title)}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl text-ink-900/20">
            🏠
          </div>
        )}
        {stale && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-red-500/95 text-white text-[10px] font-semibold uppercase tracking-wide rounded-full">
            No longer listed
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-between text-white">
          <div className="text-2xl font-bold drop-shadow-lg">{formatMoney(listing.price, city)}</div>
          {listing.neighborhood && (
            <div className="bg-white/95 text-ink-900 rounded-full px-2.5 py-1 text-xs font-semibold flex items-center gap-1 shadow-md">
              <MapPin className="w-3 h-3" /> {normalizeDisplayText(listing.neighborhood)}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="font-display text-base leading-snug mb-1.5 line-clamp-2">
          {normalizeDisplayText(listing.title)}
        </h3>
        {listing.addressLine && (
          <p className="text-xs text-ink-900/50 mb-2 truncate">{normalizeDisplayText(listing.addressLine)}</p>
        )}
        <div className="flex gap-3 text-xs text-ink-900/70 mb-3 flex-wrap">
          {listing.bedrooms != null && (
            <span className="flex items-center gap-1">
              <Bed className="w-3.5 h-3.5 text-ink-900/40" />
              {listing.bedrooms} bd
            </span>
          )}
          {listing.bathrooms != null && (
            <span className="flex items-center gap-1">
              <Bath className="w-3.5 h-3.5 text-ink-900/40" />
              {listing.bathrooms} ba
            </span>
          )}
          {listing.sqft != null && (
            <span className="flex items-center gap-1">
              <Maximize2 className="w-3.5 h-3.5 text-ink-900/40" />
              {listing.sqft.toLocaleString()} sqft
            </span>
          )}
        </div>
        {sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s, i) => (
              <span key={i} className="inline-flex items-center overflow-hidden rounded-full bg-ink-100 text-xs">
                <Link
                  href={sourceFilterHref(s.source)}
                  className="px-2.5 py-1 font-medium hover:bg-ink-100/70"
                  title={`Filter to ${sourceLabel(s.source)}`}
                >
                  {sourceLabel(s.source)}
                </Link>
                <Link
                  href={s.url}
                  target="_blank"
                  aria-label={`Open ${sourceLabel(s.source)} listing`}
                  className="px-2 py-1 border-l border-white/80 hover:bg-ink-100/70"
                >
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
