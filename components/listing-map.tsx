"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

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
}

function PriceIcon({
  price,
  color,
  highlighted,
  textColor = "#fff",
}: {
  price: number;
  color: string;
  highlighted?: boolean;
  textColor?: string;
}) {
  const pad = highlighted ? "6px 12px" : "4px 8px";
  const size = highlighted ? "13px" : "11px";
  const border = highlighted ? "3px solid #fff" : "2px solid #fff";
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
  ">$${(price / 1000).toFixed(1)}k</div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: highlighted ? [70, 32] : [60, 24],
    iconAnchor: highlighted ? [35, 16] : [30, 12],
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
}: {
  pins: MapPin[];
  focus?: { lat: number; lng: number };
  height?: string;
}) {
  const validPins = pins.filter((p) => p.lat != null && p.lng != null);
  return (
    <MapContainer
      center={[37.7749, -122.4194]}
      zoom={12}
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
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={PriceIcon({ price: p.price, color, highlighted: p.highlighted }) as any}
            zIndexOffset={p.highlighted ? 1000 : 0}
          >
            <Popup>
              <div style={{ font: "13px -apple-system,sans-serif", minWidth: 160 }}>
                <div style={{ fontWeight: 600 }}>${p.price.toLocaleString()}/mo</div>
                <div style={{ color: "#666" }}>{p.neighborhood ?? "—"}</div>
                <div style={{ marginTop: 4 }}>{p.title}</div>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#0a0a0c", marginTop: 6, display: "inline-block" }}
                  >
                    View listing →
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
