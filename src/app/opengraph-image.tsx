import { ImageResponse } from "next/og";

export const alt = "BESOK KAWIN? — Dating & Red Flag Card Game";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
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
          backgroundColor: "#090d16",
          color: "#f8fafc",
          padding: "48px",
          border: "8px solid #1f2937",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 24px",
            borderRadius: "999px",
            backgroundColor: "rgba(244, 63, 94, 0.15)",
            border: "2px solid rgba(244, 63, 94, 0.4)",
            color: "#fb7185",
            fontSize: "24px",
            fontWeight: 700,
            marginBottom: "28px",
          }}
        >
          18+ DATING & RED FLAG CARD GAME
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "84px",
            fontWeight: 800,
            letterSpacing: "-2px",
            color: "#ffffff",
            marginBottom: "16px",
          }}
        >
          BESOK KAWIN?
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "32px",
            fontWeight: 600,
            color: "#94a3b8",
            textAlign: "center",
            maxWidth: "860px",
          }}
        >
          Buka Borokmu di Depan, Biar Nggak Nyesel di KUA.
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
