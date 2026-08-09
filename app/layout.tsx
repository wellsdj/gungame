import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GUNGAME — Neon Arena",
  description: "Fast peer-to-peer 3D browser blaster battles. No bots, no accounts, just chaos.",
  openGraph: {
    title: "GUNGAME — Neon Arena",
    description: "No bots. Pure chaos. Share a room code and jump in.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "GUNGAME — Neon Arena",
    description: "No bots. Pure chaos. Share a room code and jump in.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
