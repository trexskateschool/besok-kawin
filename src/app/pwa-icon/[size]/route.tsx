import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> | { size: string } }
) {
  const resolvedParams = await Promise.resolve(context.params);
  const size = resolvedParams.size === "512" ? 512 : 192;
  const radius = Math.round(size * 0.22);
  const heartSize = Math.round(size * 0.52);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f43f5e 0%, #db2777 100%)",
          borderRadius: `${radius}px`,
        }}
      >
        <svg
          width={heartSize}
          height={heartSize}
          viewBox="0 0 24 24"
          fill="white"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
    }
  );
}
