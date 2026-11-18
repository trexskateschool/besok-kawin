import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://kartu-visi.vercel.app"),
  title: "BESOK KAWIN? — Kuis Visi & Komunikasi Pasangan",
  description:
    "Permainan kartu 20 pertanyaan jujur untuk menguji keselarasan visi, komunikasi, dan kompromi bersama pasangan.",
  openGraph: {
    title: "BESOK KAWIN? — Kuis Visi & Komunikasi Pasangan",
    description:
      "Uji keselarasan visi dan kompromi bareng pasangan lewat 20 kartu pertanyaan jujur.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "BESOK KAWIN? — Kuis Visi & Komunikasi Pasangan",
    description:
      "Uji keselarasan visi dan kompromi bareng pasangan lewat 20 kartu pertanyaan jujur.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#07080c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="bg-[#07080c] text-stone-100 antialiased">{children}</body>
    </html>
  );
}
