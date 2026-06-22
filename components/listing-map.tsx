"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { CITIES, DEFAULT_CITY, type CityId } from "@/lib/cities";
import { formatMoney, normalizeDisplayText } from "@/lib/utils";

// Fix default marker icons in webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  price: number;
  neighborhood?: string | null;
  decision?: "yes" | "no" | "maybe" | null;
  highlighted?: boolean;
  url?: string;
  photoUrl?: string;
}

function PriceIcon({
  price,
  color,
  highlighted,
  textColor = "#fff",
  city,
}: {
  price: number;
  color: string;
  highlighted?: boolean;
  textColor?: string;
  city: CityId;
}) {
  const pad = highlighted ? "6px 12px" : "4px 8px";
  const size = highlighted ? "13px" : "11px";
  const border = highlighted ? "3px solid #fff" : "2px solid #fff";
  const label = `$${(price / 1000).toFixed(1)}k${CITIES[city].currency === "CAD" ? " CAD" : ""}`;
  const shadow = highlighted
    ? "0 4px 14px rgba(0,0,0,.4), 0 0 0 2px #ec4899"
    : "0 2px 6px rgba(0,0,0,.2)";
  const html = `<div style="
    background:${color};
    color:${textColor};
    padding:${pad};
    border-radius:999px;
    font:700 ${size} -apple-system,sans-serif;
    white-space:nowrap;
    box-shadow:${shadow};
    border:${border};
    transform: ${highlighted ? "scale(1.05)" : "scale(1)"};
    transition: transform .2s;
  ">${label}</div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: CITIES[city].currency === "CAD" ? [92, 28] : (highlighted ? [70, 32] : [60, 24]),
    iconAnchor: CITIES[city].currency === "CAD" ? [46, 14] : (highlighted ? [35, 16] : [30, 12]),
  });
}

// The listing currently on the swipe card gets a much louder marker: a photo
// thumbnail, a price badge, a downward pointer to the exact spot, and a pulsing
// ring — so it's unmistakable where "this listing" sits on the map.
function CurrentIcon({
  price,
  photoUrl,
  city,
}: {
  price: number;
  photoUrl?: string;
  city: CityId;
}) {
  const label = `$${(price / 1000).toFixed(1)}k${CITIES[city].currency === "CAD" ? " CAD" : ""}`;
  const inner = photoUrl
    ? `<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;">🏠</div>`;
  const html = `<div style="position:relative;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35));">
    <span style="position:absolute;top:6px;width:58px;height:58px;border-radius:999px;background:rgba(236,72,153,.35);animation:aptPinPulse 1.6s ease-out infinite;"></span>
    <div style="position:relative;width:64px;height:64px;border-radius:16px;overflow:hidden;border:3px solid #ec4899;background:#f1f5f9;">${inner}</div>
    <div style="position:relative;margin-top:-9px;background:#ec4899;color:#fff;padding:2px 9px;border-radius:999px;font:800 11px -apple-system,sans-serif;white-space:nowrap;border:2px solid #fff;">${label}</div>
    <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #ec4899;margin-top:-1px;"></div>
  </div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: [72, 96],
    iconAnchor: [36, 96],
    popupAnchor: [0, -90],
  });
}

function FlyTo({ lat, lng }: { lat?: number; lng?: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
  }, [lat, lng, map]);
  return null;
}

export function ListingMap({
  pins,
  focus,
  height = "100%",
  city = DEFAULT_CITY,
}: {
  pins: MapPin[];
  focus?: { lat: number; lng: number };
  height?: string;
  city?: CityId;
}) {
  const cityConfig = CITIES[city];
  const validPins = pins.filter((p) => p.lat != null && p.lng != null);
  return (
    <MapContainer
      key={city}
      center={cityConfig.mapCenter}
      zoom={cityConfig.mapZoom}
      scrollWheelZoom
      style={{ height, width: "100%", borderRadius: 12 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {validPins.map((p) => {
        // The currently-focused listing stands out clearly:
        // bright pink + larger size + glowing ring. Everything else uses a
        // muted palette so it doesn't compete visually.
        const color = p.highlighted
          ? "#ec4899" // standout pink for the listing on the swipe card
          : p.decision === "yes"
            ? "#10b981" // green
            : p.decision === "no"
              ? "#cbd5e1" // faded gray-blue
              : p.decision === "maybe"
                ? "#f59e0b" // amber
                : "#94a3b8"; // muted slate gray for undecided
        const icon = p.highlighted
          ? CurrentIcon({ price: p.price, photoUrl: p.photoUrl, city })
          : PriceIcon({ price: p.price, color, highlighted: p.highlighted, city });
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={icon as any}
            zIndexOffset={p.highlighted ? 1000 : 0}
          >
            <Popup>
              <div style={{ font: "13px -apple-system,sans-serif", minWidth: 220, maxWidth: 240 }}>
                {p.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.photoUrl}
                    alt={normalizeDisplayText(p.title)}
                    style={{
                      width: "100%",
                      height: 120,
                      objectFit: "cover",
                      borderRadius: 8,
                      marginBottom: 8,
                      display: "block",
                      background: "#f1f5f9",
                    }}
                  />
                )}
                <div style={{ fontWeight: 600 }}>{formatMoney(p.price, city)}/mo</div>
                <div style={{ color: "#666" }}>{normalizeDisplayText(p.neighborhood ?? "Unknown")}</div>
                <div style={{ marginTop: 4 }}>{normalizeDisplayText(p.title)}</div>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#0a0a0c", marginTop: 6, display: "inline-block" }}
                  >
                    View listing
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
      <FlyTo lat={focus?.lat} lng={focus?.lng} />
    </MapContainer>
  );
}
