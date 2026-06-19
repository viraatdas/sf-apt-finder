"use client";

import Link from "next/link";
import type { CityId } from "@/lib/cities";
import { moveFocusWithArrowKeys } from "@/components/arrow-key-nav";
import { configuredSourcesForCity } from "@/lib/sources";
import { formatMoney } from "@/lib/utils";
import type { Source } from "@/lib/scrapers/types";

export function SourceStrip({
  city,
  className = "",
  matchingCount,
  maxPrice,
  activeSource,
  basePath = "/",
}: {
  city: CityId;
  className?: string;
  matchingCount?: number;
  maxPrice?: number;
  activeSource?: Source | null;
  basePath?: string;
}) {
  const sources = configuredSourcesForCity(city);

  function hrefFor(source: Source | null) {
    const params = new URLSearchParams();
    params.set("city", city);
    if (maxPrice != null) params.set("maxPrice", String(maxPrice));
    if (source) params.set("source", source);
    return `${basePath}?${params.toString()}`;
  }

  return (
    <section
      aria-label="Listing sources"
      onKeyDown={moveFocusWithArrowKeys}
      className={`max-w-[1900px] mx-auto px-4 xl:px-6 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-100 bg-white px-3 py-2 text-xs text-ink-900/60 shadow-sm">
        {matchingCount != null && maxPrice != null && (
          <span className="mr-1 font-semibold text-ink-900">
            {matchingCount.toLocaleString()} current listings under {formatMoney(maxPrice, city)}
          </span>
        )}
        <span className="font-semibold text-ink-900">Sources</span>
        <Link
          href={hrefFor(null)}
          data-arrow-nav-item
          className={
            "inline-flex h-7 items-center rounded-full border px-2.5 font-medium transition focus:outline-none focus:ring-2 focus:ring-ink-900/20 " +
            (!activeSource
              ? "border-ink-900 bg-ink-900 text-white"
              : "border-ink-100 bg-ink-50 text-ink-900 hover:bg-ink-100")
          }
        >
          All
        </Link>
        {sources.map((source) => (
          <Link
            key={source.source}
            href={hrefFor(source.source)}
            title={source.note}
            data-arrow-nav-item
            className={
              "inline-flex h-7 items-center rounded-full border px-2.5 font-medium transition focus:outline-none focus:ring-2 focus:ring-ink-900/20 " +
              (activeSource === source.source
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-ink-100 bg-ink-50 text-ink-900 hover:bg-ink-100")
            }
          >
            {source.label}
            {source.note && <span className="ml-1 text-ink-900/45">({source.note})</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}
