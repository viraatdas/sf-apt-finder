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

function PriceIcon({ price, color }: { price: number; color: string }) {
  const html = `<div style="
    background:${color};
    color:#fff;
    padding:4px 8px;
    border-radius:999px;
    font:600 11px -apple-system,sans-serif;
    white-space:nowrap;
    box-shadow:0 2px 6px rgba(0,0,0,.2);
    border:2px solid #fff;
  ">$${(price / 1000).toFixed(1)}k</div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: [60, 24],
    iconAnchor: [30, 12],
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
        const color = p.highlighted
          ? "#0a0a0c"
          : p.decision === "yes"
            ? "#2dd4bf"
            : p.decision === "no"
              ? "#fb7185"
              : p.decision === "maybe"
                ? "#fcd34d"
                : "#6366f1";
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={PriceIcon({ price: p.price, color }) as any}
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
