"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
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
  columbus: "🇺🇸",
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
      <div className="relative">
        <select
          aria-label="City"
          value={city}
          onChange={(event) => changeCity(event.target.value as CityId)}
          className="h-9 cursor-pointer appearance-none rounded-full border border-ink-100 bg-white pl-3 pr-8 text-sm font-semibold hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-ink-900/20"
        >
          {CITY_IDS.map((cityId) => (
            <option key={cityId} value={cityId}>
              {CITY_FLAGS[cityId]} {CITIES[cityId].name}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/45"
          aria-hidden="true"
        />
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
