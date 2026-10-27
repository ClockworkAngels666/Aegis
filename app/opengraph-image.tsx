import { ImageResponse } from "next/og";

export const alt = "Aegis · Open-Source Trade Intelligence & Dual-Use Sanctions Radar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Preview card shown when a link to the app is shared. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        background: "#ffffff", padding: "72px 80px", color: "#111318" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="112" height="112" viewBox="0 0 32 32">
            <path d="M16 2.5 L27.5 6.5 V15 C27.5 22.5 22.5 27.6 16 29.5 C9.5 27.6 4.5 22.5 4.5 15 V6.5 Z" fill="#ffffff"
              stroke="#111318" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M9.5 20.5 A6.5 6.5 0 0 1 22.5 20.5" fill="none" stroke="#8f959e" strokeWidth="1.4" />
            <path d="M12.8 20.5 A3.2 3.2 0 0 1 19.2 20.5" fill="none" stroke="#8f959e" strokeWidth="1.4" />
            <line x1="16" y1="20.5" x2="21" y2="12.5" stroke="#111318" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="16" cy="20.5" r="1.6" fill="#111318" />
            <circle cx="21.2" cy="11.8" r="2.3" fill="#d03b3b" />
          </svg>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: 22 }}>AEGIS</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 46, fontWeight: 600, lineHeight: 1.2 }}>Open-Source Trade Intelligence &amp; Dual-Use Sanctions Radar</div>
          <div style={{ fontSize: 30, color: "#5b616b" }}>
            Sanctions screening · Battlefield items · Trade diverted to Russia via third countries
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {["#2a78d6", "#eb6834", "#d03b3b", "#0ca30c"].map((c) => (
            <div key={c} style={{ width: 120, height: 10, background: c }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
