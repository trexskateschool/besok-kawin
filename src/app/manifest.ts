import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SEFREKUENSI — Relationship & Red Flag Card Game",
    short_name: "Sefrekuensi",
    description:
      "Uji nyali, selaraskan gelombang frekuensi hati, dan buka red flag bareng pasangan sebelum ke KUA.",
    start_url: "/",
    display: "standalone",
    background_color: "#070b14",
    theme_color: "#070b14",
    orientation: "portrait",
    icons: [
      {
        src: "/pwa-icon/192?v=2",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon/192?v=2",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa-icon/512?v=2",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
