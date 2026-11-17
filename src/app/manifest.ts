import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BESOK KAWIN? — Dating & Red Flag Card Game",
    short_name: "Besok Kawin?",
    description: "Uji nyali dan buka red flag bareng pasangan sebelum ke KUA.",
    start_url: "/",
    display: "standalone",
    background_color: "#090d16",
    theme_color: "#090d16",
    orientation: "portrait",
    icons: [
      {
        src: "/pwa-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
