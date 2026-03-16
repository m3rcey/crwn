import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";
import { PlayerProvider } from "@/hooks/usePlayer";
import { ToastProvider } from "@/components/shared/Toast";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { FullScreenPlayer } from "@/components/player/FullScreenPlayer";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://thecrwn.app"),
  title: "CRWN | Music Monetization for Independent Artists",
  description: "The all-in-one platform for independent artists to stream music, run fan subscriptions, sell digital products, and build community.",
  keywords: ["music", "artists", "monetization", "fans", "community", "streaming", "independent"],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "CRWN | Music Monetization for Independent Artists",
    description: "The all-in-one platform for independent artists to stream music, run fan subscriptions, sell digital products, and build community.",
    url: "https://thecrwn.app",
    siteName: "CRWN",
    images: [
      {
        url: "/icon-512x512.png",
        width: 512,
        height: 512,
        alt: "CRWN - Music Artist Platform",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "CRWN | Music Monetization for Independent Artists",
    description: "The all-in-one platform for independent artists to stream music, run fan subscriptions, sell digital products, and build community.",
    images: ["/icon-512x512.png"],
  },
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
        className={`${inter.variable} font-sans antialiased bg-[#0D0D0D] text-crwn-text min-h-screen pb-20`}
      >
        <AuthProvider>
          <PlayerProvider>
            <ToastProvider>
              {children}
              <MiniPlayer />
              <FullScreenPlayer />
              <ServiceWorkerRegistration />
            </ToastProvider>
          </PlayerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
