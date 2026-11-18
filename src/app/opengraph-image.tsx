import { ImageResponse } from "next/og";

export const alt = "Kartu Visi & Komunikasi Pasangan";
export const size = {
  width: 512,
  height: 512,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#07080c",
          backgroundImage:
            "radial-gradient(circle at 50% 35%, rgba(229, 193, 123, 0.28), transparent 70%)",
        }}
      >
        <div
          style={{
            width: 320,
            height: 320,
            borderRadius: "999px",
            border: "8px solid #F59E0B",
            backgroundColor: "#0b0c12",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="180" height="180" viewBox="0 0 24 24" fill="none">
            <path d="M12 3L14.5 6L12 8.5L9.5 6L12 3Z" fill="#FDE68A" />
            <circle
              cx="9.5"
              cy="14.5"
              r="5.2"
              stroke="#F59E0B"
              strokeWidth="2"
            />
            <circle
              cx="14.5"
              cy="14.5"
              r="5.2"
              stroke="#FB7185"
              strokeWidth="2"
            />
          </svg>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
