import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "BESOK KAWIN? — Dating & Red Flag Card Game",
  description: "Uji nyali sebelum DP gedung. Buka borokmu di depan, biar nggak nyesel di KUA.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body
        className={`${jakarta.variable} ${jetbrains.variable} font-sans bg-grid-pattern min-h-screen flex flex-col justify-between selection:bg-rose-500 selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
