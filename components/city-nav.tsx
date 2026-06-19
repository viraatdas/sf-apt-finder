"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, SlidersHorizontal } from "lucide-react";
import { moveFocusWithArrowKeys } from "@/components/arrow-key-nav";
import { CITIES, CITY_IDS, cityFromParam, maxPriceFromParam, type CityId } from "@/lib/cities";

const NAV_ITEMS = [
  { href: "/", label: "Swipe" },
  { href: "/map", label: "Map" },
  { href: "/liked", label: "Shortlist" },
] as const;

export function CityNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const city = cityFromParam(searchParams.get("city"));
  const maxPrice = maxPriceFromParam(city, searchParams.get("maxPrice"));
  const priceMin = 500;
  const priceMax = CITIES[city].defaultMaxPrice;
  const [priceInput, setPriceInput] = useState(maxPrice);

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

  return (
    <nav
      aria-label="Primary"
      onKeyDown={moveFocusWithArrowKeys}
      className="flex flex-wrap gap-1.5 text-sm items-center justify-end"
    >
      <select
        aria-label="City"
        value={city}
        onChange={(event) => changeCity(event.target.value as CityId)}
        className="h-9 rounded-full border border-ink-100 bg-white px-3 text-sm font-medium hover:bg-ink-50"
      >
        {CITY_IDS.map((cityId) => (
          <option key={cityId} value={cityId}>
            {CITIES[cityId].name}
          </option>
        ))}
      </select>
      <div
        className="flex items-center gap-2 rounded-full border border-ink-100 bg-white px-3 py-1.5"
      >
        <SlidersHorizontal className="h-4 w-4 text-ink-900/45" aria-hidden="true" />
        <label className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink-900/60 whitespace-nowrap">Max price</span>
          <input
            aria-label="Max price"
            name="maxPrice"
            type="range"
            min={priceMin}
            max={priceMax}
            step={100}
            value={priceInput}
            onInput={(event) => setPriceInput(Number(event.currentTarget.value))}
            onChange={(event) => setPriceInput(Number(event.target.value))}
            className="h-2 w-28 accent-ink-900"
          />
          <output className="w-16 text-right text-sm font-semibold tabular-nums" aria-live="polite">
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
      <a
        href="mailto:viraat@exla.ai?subject=apt-tinder"
        data-arrow-nav-item
        aria-label="Email viraat@exla.ai"
        title="viraat@exla.ai"
        className="ml-1 px-3 py-1.5 rounded-full bg-accent-yes/10 text-accent-yes hover:bg-accent-yes/20 font-medium inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-accent-yes/30"
      >
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        Contact
      </a>
    </nav>
  );
}
