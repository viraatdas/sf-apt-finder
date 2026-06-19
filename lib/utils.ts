import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { CITIES, DEFAULT_CITY, type CityId } from "@/lib/cities";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(n: number | null | undefined, city: CityId = DEFAULT_CITY): string {
  if (n == null) return "N/A";
  const value = CITIES[city].currencySymbol + n.toLocaleString();
  return CITIES[city].currency === "CAD" ? `${value} CAD` : value;
}

export function normalizeDisplayText(value: string | null | undefined): string {
  return (value ?? "").replace(/[\u2013\u2014]/g, "-");
}
