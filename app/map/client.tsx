"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { formatMoney, normalizeDisplayText } from "@/lib/utils";
import type { Listing } from "@/lib/db/schema";
import type { CityId } from "@/lib/cities";

const ListingMap = dynamic(() => import("@/components/listing-map").then((m) => m.ListingMap), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-ink-100 animate-pulse rounded-xl" />,
});

type Decision = "yes" | "no" | "maybe";

export function MapPageClient({
  listings,
  decisions,
  city,
}: {
  listings: Listing[];
  decisions: Record<string, Decision>;
  city: CityId;
}) {
  const [filter, setFilter] = useState<"all" | Decision | "undecided">("all");
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | undefined>();

  const grouped = useMemo(() => {
    const m = new Map<string, Listing[]>();
    for (const l of listings) {
      const k = l.neighborhood ?? "Other";
      const arr = m.get(k) ?? [];
      arr.push(l);
      m.set(k, arr);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [listings]);

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      if (neighborhood && l.neighborhood !== neighborhood) return false;
      const d = decisions[l.id];
      if (filter === "all") return true;
      if (filter === "undecided") return !d;
      return d === filter;
    });
  }, [listings, decisions, filter, neighborhood]);

  const pins = filtered
    .filter((l) => l.lat != null && l.lng != null)
    .map((l) => ({
      id: l.id,
      lat: l.lat!,
      lng: l.lng!,
      title: normalizeDisplayText(l.title),
      price: l.price ?? 0,
      neighborhood: l.neighborhood,
      decision: decisions[l.id] ?? null,
      url: (l.sources as any)?.[0]?.url,
    }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 max-w-[1600px] mx-auto p-4 lg:p-6">
      {/* Sidebar: neighborhoods */}
      <aside className="space-y-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto no-scrollbar">
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-900/50 mb-2">Filter</div>
          <div className="flex flex-wrap gap-1">
            {(["all", "undecided", "yes", "maybe", "no"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  "text-xs px-3 py-1.5 rounded-full border " +
                  (filter === f
                    ? "bg-ink-900 text-white border-ink-900"
                    : "bg-white border-ink-100 hover:bg-ink-50")
                }
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-900/50 mb-2">
            Neighborhoods ({grouped.length})
          </div>
          <div className="space-y-1">
            <button
              onClick={() => setNeighborhood(null)}
              className={
                "w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between " +
                (neighborhood == null ? "bg-ink-900 text-white" : "hover:bg-ink-100")
              }
            >
              <span>All neighborhoods</span>
              <span className="text-xs opacity-60">{listings.length}</span>
            </button>
            {grouped.map(([name, items]) => {
              const minPrice = Math.min(...items.map((i) => i.price ?? Infinity));
              return (
                <button
                  key={name}
                  onClick={() => {
                    setNeighborhood(name);
                    const withCoords = items.find((i) => i.lat && i.lng);
                    if (withCoords) setFocus({ lat: withCoords.lat!, lng: withCoords.lng! });
                  }}
                  className={
                    "w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between " +
                    (neighborhood === name ? "bg-ink-900 text-white" : "hover:bg-ink-100")
                  }
                >
                  <span className="truncate">{normalizeDisplayText(name)}</span>
                  <span className="text-xs opacity-60 ml-2 shrink-0">
                    {items.length} · from {formatMoney(minPrice === Infinity ? null : minPrice, city)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Map + list */}
      <div className="grid grid-rows-[1fr_auto] gap-4">
        <div className="h-[60vh] lg:h-[calc(100vh-9rem)] rounded-2xl overflow-hidden border border-ink-100 shadow-sm">
          <ListingMap pins={pins} focus={focus} city={city} />
        </div>
      </div>
    </div>
  );
}
