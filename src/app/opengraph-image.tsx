import { ImageResponse } from "next/og";

export const alt = "BESOK KAWIN? — Kartu Obrolan & Kuis Pasangan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#07080c",
          backgroundImage:
            "radial-gradient(circle at 50% 30%, rgba(229, 193, 123, 0.25), transparent 65%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            width: 170,
            height: 170,
            borderRadius: "999px",
            border: "4px solid #F59E0B",
            backgroundColor: "#0b0c12",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
          }}
        >
          <svg width="96" height="96" viewBox="0 0 24 24" fill="none">
            <path d="M12 3L14.5 6L12 8.5L9.5 6L12 3Z" fill="#FDE68A" />
            <circle cx="9.5" cy="14.5" r="5.2" stroke="#F59E0B" strokeWidth="2" />
            <circle cx="14.5" cy="14.5" r="5.2" stroke="#FB7185" strokeWidth="2" />
          </svg>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 900,
            color: "#FEF3C7",
            marginBottom: 12,
          }}
        >
          BESOK KAWIN?
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#A8A29E" }}>
          Kartu Obrolan &amp; Kuis Komunikasi Pasangan
        </div>
      </div>
    ),
    { ...size }
  );
}
