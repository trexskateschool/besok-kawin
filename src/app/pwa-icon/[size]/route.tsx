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
          backgroundColor: "#090d16",
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
            {/* Latar Glow Rose & Emas */}
            <radialGradient id="bgRoseGlow" cx="42%" cy="42%" r="58%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.34" />
              <stop offset="60%" stopColor="#881337" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#090d16" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bgGoldGlow" cx="68%" cy="65%" r="45%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#090d16" stopOpacity="0" />
            </radialGradient>

            {/* Gradasi Kartu Belakang (Dark Red Flag) */}
            <linearGradient id="darkCardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            {/* Gradasi Kartu Depan (Ivory Wedding Card) */}
            <linearGradient id="lightCardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="65%" stopColor="#fff1f2" />
              <stop offset="100%" stopColor="#ffe4e6" />
            </linearGradient>

            {/* Gradasi Emas Cincin Nikah */}
            <linearGradient id="goldRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="45%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id="goldRingGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fde047" />
              <stop offset="50%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#92400e" />
            </linearGradient>

            {/* Gradasi Berlian */}
            <linearGradient id="diamondGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#bae6fd" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>

          {/* Full-Bleed Background (Aman untuk Maskable Icon Android) */}
          <rect width="512" height="512" fill="#090d16" />
          <rect width="512" height="512" fill="url(#bgRoseGlow)" />
          <rect width="512" height="512" fill="url(#bgGoldGlow)" />

          {/* KARTU BELAKANG (Miring Kiri - Tema Red Flag) */}
          <g transform="rotate(-14 215 265)">
            <rect
              x="112"
              y="104"
              width="202"
              height="292"
              rx="26"
              fill="url(#darkCardGrad)"
              stroke="#f43f5e"
              strokeWidth="6"
            />
            {/* Ikon Bendera Merah Kecil di Pojok Kiri Atas Kartu Belakang */}
            <line
              x1="142"
              y1="134"
              x2="142"
              y2="174"
              stroke="#fda4af"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <path
              d="M144 136 L172 143 L144 153 Z"
              fill="#f43f5e"
            />
          </g>

          {/* BAYANGAN KARTU DEPAN */}
          <g transform="rotate(9 288 266)">
            <rect
              x="182"
              y="112"
              width="212"
              height="304"
              rx="28"
              fill="#020617"
              opacity="0.6"
            />
          </g>

          {/* KARTU DEPAN (Miring Kanan - Kartu Utama Besok Kawin) */}
          <g transform="rotate(9 288 262)">
            <rect
              x="184"
              y="106"
              width="212"
              height="304"
              rx="28"
              fill="url(#lightCardGrad)"
              stroke="url(#goldRingGrad)"
              strokeWidth="7"
            />
            {/* Bingkai Tipis Bagian Dalam Kartu */}
            <rect
              x="198"
              y="120"
              width="184"
              height="276"
              rx="18"
              fill="none"
              stroke="#f43f5e"
              strokeOpacity="0.25"
              strokeWidth="2.5"
            />

            {/* Simbol Hati Pojok Kiri Atas Kartu */}
            <path
              d="M224 156 C224 156 210 146 210 137 C210 132 214 128 218.5 128 C221.5 128 223.3 129.8 224 131.5 C224.7 129.8 226.5 128 229.5 128 C234 128 238 132 238 137 C238 146 224 156 224 156 Z"
              fill="#e11d48"
            />

            {/* Simbol Hati Terbalik Pojok Kanan Bawah Kartu */}
            <path
              d="M356 360 C356 360 342 370 342 379 C342 384 346 388 350.5 388 C353.5 388 355.3 386.2 356 384.5 C356.7 386.2 358.5 388 361.5 388 C366 388 370 384 370 379 C370 370 356 360 356 360 Z"
              fill="#e11d48"
            />
          </g>

          {/* SEPASANG CINCIN NIKAH EMAS SALING MENGUNCI */}
          <g>
            {/* Cincin Kiri */}
            <circle
              cx="262"
              cy="274"
              r="46"
              stroke="url(#goldRingGrad)"
              strokeWidth="14"
              fill="none"
            />
            <circle
              cx="262"
              cy="274"
              r="40"
              stroke="#fef08a"
              strokeOpacity="0.65"
              strokeWidth="2"
              fill="none"
            />

            {/* Cincin Kanan */}
            <circle
              cx="318"
              cy="274"
              r="46"
              stroke="url(#goldRingGrad2)"
              strokeWidth="14"
              fill="none"
            />
            <circle
              cx="318"
              cy="274"
              r="40"
              stroke="#fef08a"
              strokeOpacity="0.65"
              strokeWidth="2"
              fill="none"
            />

            {/* Lengkungan Atas Cincin Kiri (Efek Saling Mengunci) */}
            <path
              d="M 273.9 229.6 A 46 46 0 0 1 303.7 254.5"
              stroke="url(#goldRingGrad)"
              strokeWidth="14"
              strokeLinecap="round"
              fill="none"
            />

            {/* Dudukan Mahkota Berlian */}
            <polygon
              points="309,228 327,228 323,219 313,219"
              fill="#d97706"
            />

            {/* Berlian Solitaire */}
            <polygon
              points="306,194 330,194 339,204 318,222 297,204"
              fill="url(#diamondGrad)"
              stroke="#7dd3fc"
              strokeWidth="2"
            />
            <polygon
              points="311,194 325,194 328,204 308,204"
              fill="#ffffff"
              opacity="0.8"
            />
            <polygon
              points="308,204 328,204 318,222"
              fill="#38bdf8"
              opacity="0.4"
            />

            {/* Kilau Bintang Berlian */}
            <path
              d="M350 178 L352.5 184.5 L359 187 L352.5 189.5 L350 196 L347.5 189.5 L341 187 L347.5 184.5 Z"
              fill="#f59e0b"
            />
            <path
              d="M288 176 L290 181 L295 183 L290 185 L288 190 L286 185 L281 183 L286 181 Z"
              fill="#38bdf8"
            />
          </g>
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
    }
  );
}
