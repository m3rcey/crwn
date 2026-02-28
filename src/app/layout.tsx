import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";
import { PlayerProvider } from "@/hooks/usePlayer";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { FullScreenPlayer } from "@/components/player/FullScreenPlayer";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRWN | Music Artist Platform",
  description: "The all-in-one platform for music artists to monetize, connect with fans, and build community.",
  keywords: ["music", "artists", "monetization", "fans", "community"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CRWN",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0D0D0D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} font-sans antialiased bg-crwn-bg text-crwn-text min-h-screen pb-20`}
      >
        <AuthProvider>
          <PlayerProvider>
            {children}
            <MiniPlayer />
            <FullScreenPlayer />
            <ServiceWorkerRegistration />
          </PlayerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
