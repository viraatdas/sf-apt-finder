/**
 * Rough SF neighborhood bounding boxes. Picks the first match.
 * Good enough for categorization — not for legal boundaries.
 */
export interface Neighborhood {
  name: string;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export const SF_NEIGHBORHOODS: Neighborhood[] = [
  { name: "Pacific Heights", bbox: [-122.4505, 37.787, -122.42, 37.798] },
  { name: "Marina", bbox: [-122.45, 37.797, -122.426, 37.808] },
  { name: "Cow Hollow", bbox: [-122.444, 37.793, -122.428, 37.8] },
  { name: "Russian Hill", bbox: [-122.425, 37.795, -122.408, 37.808] },
  { name: "North Beach", bbox: [-122.413, 37.797, -122.398, 37.81] },
  { name: "Telegraph Hill", bbox: [-122.408, 37.795, -122.395, 37.806] },
  { name: "Financial District", bbox: [-122.405, 37.785, -122.39, 37.798] },
  { name: "SoMa", bbox: [-122.42, 37.768, -122.385, 37.788] },
  { name: "Mission Bay", bbox: [-122.4, 37.765, -122.378, 37.78] },
  { name: "Potrero Hill", bbox: [-122.41, 37.748, -122.385, 37.768] },
  { name: "Dogpatch", bbox: [-122.395, 37.748, -122.378, 37.765] },
  { name: "Mission", bbox: [-122.428, 37.74, -122.402, 37.768] },
  { name: "Noe Valley", bbox: [-122.44, 37.738, -122.422, 37.755] },
  { name: "Castro", bbox: [-122.445, 37.755, -122.428, 37.768] },
  { name: "Hayes Valley", bbox: [-122.435, 37.772, -122.418, 37.782] },
  { name: "NoPa", bbox: [-122.448, 37.772, -122.43, 37.782] },
  { name: "Lower Haight", bbox: [-122.435, 37.768, -122.422, 37.775] },
  { name: "Haight-Ashbury", bbox: [-122.458, 37.765, -122.435, 37.775] },
  { name: "Cole Valley", bbox: [-122.456, 37.76, -122.442, 37.768] },
  { name: "Inner Sunset", bbox: [-122.475, 37.755, -122.455, 37.77] },
  { name: "Sunset", bbox: [-122.51, 37.74, -122.475, 37.77] },
  { name: "Inner Richmond", bbox: [-122.475, 37.775, -122.455, 37.79] },
  { name: "Richmond", bbox: [-122.51, 37.772, -122.475, 37.79] },
  { name: "Presidio Heights", bbox: [-122.46, 37.785, -122.445, 37.795] },
  { name: "Western Addition", bbox: [-122.442, 37.778, -122.425, 37.79] },
  { name: "Japantown", bbox: [-122.435, 37.783, -122.425, 37.79] },
  { name: "Tenderloin", bbox: [-122.42, 37.78, -122.408, 37.788] },
  { name: "Nob Hill", bbox: [-122.42, 37.788, -122.405, 37.798] },
  { name: "Chinatown", bbox: [-122.41, 37.792, -122.402, 37.8] },
  { name: "Bernal Heights", bbox: [-122.422, 37.728, -122.402, 37.745] },
  { name: "Glen Park", bbox: [-122.445, 37.728, -122.422, 37.74] },
  { name: "Excelsior", bbox: [-122.44, 37.71, -122.41, 37.728] },
  { name: "Bayview", bbox: [-122.4, 37.72, -122.37, 37.748] },
  { name: "Outer Mission", bbox: [-122.46, 37.71, -122.435, 37.73] },
];

export const VANCOUVER_NEIGHBORHOODS: Neighborhood[] = [
  { name: "Coal Harbour", bbox: [-123.13, 49.285, -123.105, 49.297] },
  { name: "West End", bbox: [-123.145, 49.279, -123.125, 49.295] },
  { name: "Downtown", bbox: [-123.13, 49.275, -123.1, 49.292] },
  { name: "Yaletown", bbox: [-123.13, 49.271, -123.112, 49.279] },
  { name: "Olympic Village", bbox: [-123.115, 49.265, -123.1, 49.275] },
  { name: "Strathcona", bbox: [-123.1, 49.272, -123.075, 49.285] },
  { name: "Fairview", bbox: [-123.14, 49.255, -123.115, 49.27] },
  { name: "Mount Pleasant", bbox: [-123.115, 49.255, -123.09, 49.27] },
  { name: "Kitsilano", bbox: [-123.18, 49.258, -123.135, 49.275] },
  { name: "Commercial Drive", bbox: [-123.08, 49.26, -123.055, 49.285] },
  { name: "Main Street", bbox: [-123.115, 49.235, -123.095, 49.255] },
  { name: "Marpole", bbox: [-123.145, 49.2, -123.105, 49.225] },
  { name: "Dunbar", bbox: [-123.195, 49.235, -123.17, 49.265] },
  { name: "Point Grey", bbox: [-123.225, 49.255, -123.185, 49.275] },
  { name: "Kerrisdale", bbox: [-123.17, 49.22, -123.14, 49.24] },
  { name: "Burnaby Metrotown", bbox: [-123.02, 49.215, -122.985, 49.235] },
  { name: "North Van Lonsdale", bbox: [-123.095, 49.31, -123.065, 49.335] },
  { name: "New West Uptown", bbox: [-122.93, 49.205, -122.895, 49.225] },
];

export function neighborhoodFor(
  lat?: number | null,
  lng?: number | null,
  city: "san-francisco" | "vancouver" = "san-francisco"
): string | undefined {
  if (lat == null || lng == null) return undefined;
  const neighborhoods = city === "vancouver" ? VANCOUVER_NEIGHBORHOODS : SF_NEIGHBORHOODS;
  for (const n of neighborhoods) {
    const [minLng, minLat, maxLng, maxLat] = n.bbox;
    if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
      return n.name;
    }
  }
  return "Other";
}
