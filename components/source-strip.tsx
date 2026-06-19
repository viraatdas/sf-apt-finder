import type { CityId } from "@/lib/cities";
import { configuredSourcesForCity } from "@/lib/sources";
import { formatMoney } from "@/lib/utils";

export function SourceStrip({
  city,
  className = "",
  matchingCount,
  maxPrice,
}: {
  city: CityId;
  className?: string;
  matchingCount?: number;
  maxPrice?: number;
}) {
  const sources = configuredSourcesForCity(city);

  return (
    <section
      aria-label="Listing sources"
      className={`max-w-[1900px] mx-auto px-4 xl:px-6 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-100 bg-white px-3 py-2 text-xs text-ink-900/60 shadow-sm">
        {matchingCount != null && maxPrice != null && (
          <span className="mr-1 font-semibold text-ink-900">
            {matchingCount.toLocaleString()} current listings under {formatMoney(maxPrice, city)}
          </span>
        )}
        <span className="font-semibold text-ink-900">Sources</span>
        {sources.map((source) => (
          <span
            key={source.source}
            title={source.note}
            className="inline-flex h-7 items-center rounded-full border border-ink-100 bg-ink-50 px-2.5 font-medium text-ink-900"
          >
            {source.label}
            {source.note && <span className="ml-1 text-ink-900/45">({source.note})</span>}
          </span>
        ))}
      </div>
    </section>
  );
}
