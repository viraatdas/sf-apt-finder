import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "apt-tinder · swipe apartments";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          padding: 72,
          background: "linear-gradient(135deg, #ec4899 0%, #0a0a0c 70%)",
          color: "#fff",
          fontFamily: "ui-serif, Georgia, serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 64,
            right: 80,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: -0.5,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <svg width="44" height="44" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="14" fill="#fff" />
            <path
              d="M32 14 L48 30 L48 50 L16 50 L16 30 Z"
              fill="#0a0a0c"
            />
            <path
              d="M32 28 c-3 -5 -10 -1 -7 5 c1.5 3 5 5 7 7 c2 -2 5.5 -4 7 -7 c3 -6 -4 -10 -7 -5 Z"
              fill="#ec4899"
            />
          </svg>
          <span>apt·tinder</span>
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
            marginBottom: 24,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          Vancouver and San Francisco rentals
        </div>
        <div
          style={{
            fontSize: 110,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: -3,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>Swipe through</span>
          <span style={{ color: "#f9a8d4" }}>fresh rentals daily</span>
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 26,
            fontWeight: 500,
            color: "rgba(255,255,255,0.78)",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          }}
        >
          Craigslist · Kijiji · PadMapper · Zumper · liv.rent · rentals.ca — deduped daily
        </div>
      </div>
    ),
    { ...size }
  );
}
