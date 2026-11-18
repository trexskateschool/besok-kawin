import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sefrekuensi.vercel.app"),
  title: "SEFREKUENSI — Game Kartu Dilema & Kompromi",
  description:
    "Permainan kartu multiplayer untuk menguji cara berpikir, negosiasi, dan kompromi bersama teman atau lawan AI dalam 8 ronde.",
  openGraph: {
    title: "SEFREKUENSI — Game Kartu Dilema & Kompromi",
    description:
      "Jawab 20 kartu pengakuan singkat, lalu adu argumen dan cari kompromi dalam 8 ronde cepat.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SEFREKUENSI — Game Kartu Dilema & Kompromi",
    description:
      "Jawab 20 kartu pengakuan singkat, lalu adu argumen dan cari kompromi dalam 8 ronde cepat.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#090a0f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="bg-[#090a0f] text-stone-100 antialiased">{children}</body>
    </html>
  );
}
