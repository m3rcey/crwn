import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRWN | Music Artist Platform",
  description: "The all-in-one platform for music artists to monetize, connect with fans, and build community.",
  keywords: ["music", "artists", "monetization", "fans", "community"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} font-sans antialiased bg-crwn-bg text-crwn-text min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
