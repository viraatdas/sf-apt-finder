"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
  const [priceInput, setPriceInput] = useState(String(maxPrice));

  useEffect(() => {
    setPriceInput(String(maxPrice));
  }, [maxPrice]);

  const baseParams = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  function hrefFor(href: string, nextCity: CityId = city, nextMaxPrice = maxPrice) {
    const params = new URLSearchParams(baseParams.toString());
    params.set("city", nextCity);
    if (nextMaxPrice === CITIES[nextCity].defaultMaxPrice) {
      params.delete("maxPrice");
    } else {
      params.set("maxPrice", String(nextMaxPrice));
    }
    const query = params.toString();
    return query ? `${href}?${query}` : href;
  }

  function changeCity(nextCity: CityId) {
    router.push(hrefFor(pathname, nextCity, CITIES[nextCity].defaultMaxPrice));
  }

  function applyPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(priceInput);
    const nextMaxPrice = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : CITIES[city].defaultMaxPrice;
    router.push(hrefFor(pathname, city, nextMaxPrice));
  }

  return (
    <nav className="flex flex-wrap gap-1.5 text-sm items-center justify-end">
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
      <form onSubmit={applyPrice} className="flex items-center gap-1">
        <label className="flex items-center gap-1.5 rounded-full border border-ink-100 bg-white pl-3 pr-2 h-9 hover:bg-ink-50">
          <span className="text-xs font-semibold text-ink-900/55">Max price</span>
          <input
            aria-label="Max price"
            type="number"
            min={1}
            step={100}
            inputMode="numeric"
            value={priceInput}
            onChange={(event) => setPriceInput(event.target.value)}
            className="h-7 w-20 bg-transparent text-sm font-medium tabular-nums outline-none"
          />
        </label>
        <button
          type="submit"
          className="h-9 px-3 rounded-full bg-ink-900 text-white text-sm font-medium hover:bg-ink-900/85"
        >
          Apply
        </button>
      </form>
      {NAV_ITEMS.map((item) => (
        <Link key={item.href} href={hrefFor(item.href)} className="px-3 py-1.5 rounded-full hover:bg-ink-100">
          {item.label}
        </Link>
      ))}
      <a
        href="mailto:viraat@exla.ai?subject=apt-tinder"
        className="ml-1 px-3 py-1.5 rounded-full bg-accent-yes/10 text-accent-yes hover:bg-accent-yes/20 font-medium"
      >
        Interested? viraat@exla.ai
      </a>
    </nav>
  );
}
