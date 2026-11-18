import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "SEFREKUENSI — Dating & Red Flag Card Game",
  description:
    "Bukan aplikasi cari pencitraan. Jawab 20 pengakuan jujur, hadapi kartu masalah pasangan, dan ukur apakah Baterai Cinta kalian sanggup bertahan.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#090d16",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`dark ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-grid-pattern min-h-screen flex flex-col justify-between selection:bg-rose-500 selection:text-white antialiased">
        {children}
      </body>
    </html>
  );
}
