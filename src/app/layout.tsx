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
  title: "CRWN | The AI Operating System for Independent Artists",
  description: "Stream music, build community, sell merch, and grow your fanbase — all in one platform. Join 217+ founding artists.",
  keywords: ["music", "artists", "monetization", "fans", "community", "streaming", "independent"],
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-512x512.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "CRWN | The AI Operating System for Independent Artists",
    description: "Stream music, build community, sell merch, and grow your fanbase — all in one platform.",
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
    title: "CRWN | The AI Operating System for Independent Artists",
    description: "Stream music, build community, sell merch, and grow your fanbase — all in one platform.",
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
        className={`${inter.variable} font-sans antialiased bg-transparent text-crwn-text min-h-screen pb-20`}
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
