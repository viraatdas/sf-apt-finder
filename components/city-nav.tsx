"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { moveFocusWithArrowKeys } from "@/components/arrow-key-nav";
import { CITIES, CITY_IDS, cityFromParam, maxPriceFromParam, type CityId } from "@/lib/cities";

const NAV_ITEMS = [
  { href: "/", label: "Swipe" },
  { href: "/map", label: "Map" },
  { href: "/liked", label: "Shortlist" },
] as const;

const CITY_FLAGS: Record<CityId, string> = {
  "san-francisco": "🇺🇸",
  vancouver: "🇨🇦",
};

export function CityNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const city = cityFromParam(searchParams.get("city"));
  const maxPrice = maxPriceFromParam(city, searchParams.get("maxPrice"));
  const priceMin = 500;
  const priceMax = CITIES[city].defaultMaxPrice;
  const [priceInput, setPriceInput] = useState(maxPrice);
  const priceInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPriceInput(maxPrice);
  }, [maxPrice]);

  const baseParams = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  const hrefFor = useCallback((href: string, nextCity: CityId = city, nextMaxPrice = maxPrice) => {
    const params = new URLSearchParams(baseParams.toString());
    params.set("city", nextCity);
    if (nextMaxPrice === CITIES[nextCity].defaultMaxPrice) {
      params.delete("maxPrice");
    } else {
      params.set("maxPrice", String(nextMaxPrice));
    }
    const query = params.toString();
    return query ? `${href}?${query}` : href;
  }, [baseParams, city, maxPrice]);

  function changeCity(nextCity: CityId) {
    router.push(hrefFor(pathname, nextCity, CITIES[nextCity].defaultMaxPrice));
  }

  useEffect(() => {
    if (priceInput === maxPrice) return;
    const timer = window.setTimeout(() => {
      router.replace(hrefFor(pathname, city, priceInput), { scroll: false });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [city, hrefFor, maxPrice, pathname, priceInput, router]);

  useEffect(() => {
    const input = priceInputRef.current;
    if (!input) return;
    const syncPrice = () => setPriceInput(Number(input.value));
    input.addEventListener("input", syncPrice);
    input.addEventListener("change", syncPrice);
    return () => {
      input.removeEventListener("input", syncPrice);
      input.removeEventListener("change", syncPrice);
    };
  }, []);

  const pricePct = ((priceInput - priceMin) / (priceMax - priceMin)) * 100;

  return (
    <nav
      aria-label="Primary"
      onKeyDown={moveFocusWithArrowKeys}
      className="flex flex-wrap gap-1.5 text-sm items-center justify-end"
    >
      <div
        role="group"
        aria-label="City"
        className="flex items-center rounded-full border border-ink-100 bg-ink-50 p-0.5"
      >
        {CITY_IDS.map((cityId) => {
          const active = cityId === city;
          return (
            <button
              key={cityId}
              type="button"
              onClick={() => changeCity(cityId)}
              aria-pressed={active}
              className={
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-ink-900/20 " +
                (active
                  ? "bg-ink-900 text-white shadow-sm"
                  : "text-ink-900/60 hover:text-ink-900 hover:bg-white")
              }
            >
              <span aria-hidden="true">{CITY_FLAGS[cityId]}</span>
              {CITIES[cityId].name}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2.5 rounded-full border border-ink-100 bg-white px-3.5 py-1.5">
        <SlidersHorizontal className="h-4 w-4 text-ink-900/45" aria-hidden="true" />
        <label className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-ink-900/60 whitespace-nowrap">Max</span>
          <span className="text-[10px] text-ink-900/35 tabular-nums">
            ${(priceMin / 1000).toFixed(1)}k
          </span>
          <input
            ref={priceInputRef}
            aria-label="Max price"
            name="maxPrice"
            type="range"
            min={priceMin}
            max={priceMax}
            step={50}
            value={priceInput}
            onInput={(event) => setPriceInput(Number(event.currentTarget.value))}
            onChange={(event) => setPriceInput(Number(event.target.value))}
            className="price-slider w-36 sm:w-44"
            style={{
              background: `linear-gradient(to right, #0a0a0c 0%, #0a0a0c ${pricePct}%, #ececef ${pricePct}%, #ececef 100%)`,
            }}
          />
          <span className="text-[10px] text-ink-900/35 tabular-nums">
            ${(priceMax / 1000).toFixed(0)}k
          </span>
          <output
            className="w-[4.5rem] text-right text-sm font-bold tabular-nums text-ink-900"
            aria-live="polite"
          >
            ${priceInput.toLocaleString()}
          </output>
        </label>
      </div>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={hrefFor(item.href)}
          data-arrow-nav-item
          className="px-3 py-1.5 rounded-full hover:bg-ink-100 focus:outline-none focus:ring-2 focus:ring-ink-900/20"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
