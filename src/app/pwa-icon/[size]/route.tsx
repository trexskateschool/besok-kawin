import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> | { size: string } }
) {
  const resolvedParams = await Promise.resolve(context.params);
  const size = resolvedParams.size === "512" ? 512 : 192;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#070b14",
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Latar Glow Rose & Emerald (Khas Sefrekuensi & Baterai Cinta) */}
            <radialGradient id="bgRoseGlow" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.38" />
              <stop offset="70%" stopColor="#881337" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#070b14" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bgEmeraldGlow" cx="75%" cy="75%" r="55%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#070b14" stopOpacity="0" />
            </radialGradient>

            {/* Gradasi Kartu Utama */}
            <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>

            {/* Gradasi Gelombang Frekuensi & Hati */}
            <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>

          {/* Full-Bleed Background (Aman untuk Maskable Icon Android) */}
          <rect width="512" height="512" fill="#070b14" />
          <rect width="512" height="512" fill="url(#bgRoseGlow)" />
          <rect width="512" height="512" fill="url(#bgEmeraldGlow)" />

          {/* KARTU PERMAINAN (Simbol Card Game SEFREKUENSI) */}
          <rect
            x="96"
            y="80"
            width="320"
            height="352"
            rx="48"
            fill="url(#cardGrad)"
            stroke="#f43f5e"
            strokeOpacity="0.5"
            strokeWidth="8"
          />

          {/* Bingkai Dalam Kartu */}
          <rect
            x="120"
            y="104"
            width="272"
            height="304"
            rx="32"
            fill="none"
            stroke="#334155"
            strokeWidth="3"
          />

          {/* SIMBOL UTAMA: GELOMBANG FREKUENSI YANG MEMBENTUK SILUET HATI */}
          <g transform="translate(0, 15)">
            {/* Gelombang / Sine Wave & EKG Stylized menyatu jadi bentuk Hati / Sinyal */}
            <path
              d="M 160 240 
                 Q 200 160, 256 220 
                 Q 312 160, 352 240 
                 Q 352 300, 256 360 
                 Q 160 300, 160 240 Z"
              fill="url(#waveGrad)"
              fillOpacity="0.22"
              stroke="url(#waveGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Garis Pulsa Denyut Nadi / Frekuensi di Tengah Hati */}
            <path
              d="M 180 256 L 220 256 L 240 210 L 272 300 L 292 240 L 312 270 L 332 256 L 352 256"
              fill="none"
              stroke="#ffffff"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>

          {/* TITIK NODAL FREKUENSI (Aksen Teknologi & Koneksi) */}
          <circle cx="256" cy="256" r="8" fill="#ffffff" />
          <circle cx="256" cy="256" r="18" stroke="#38bdf8" strokeWidth="4" fill="none" opacity="0.8" />

          {/* Aksen Minimalis Sudut (Khas Kartu) */}
          <circle cx="152" cy="144" r="8" fill="#f43f5e" />
          <circle cx="360" cy="368" r="8" fill="#10b981" />
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
    }
  );
              }
