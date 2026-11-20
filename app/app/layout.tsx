import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import { SessionProvider } from "@/components/SessionProvider";
import { AppShell } from "@/components/AppShell";
import { PwaProvider } from "@/components/Pwa";
import { THEME_COLOR } from "./manifest";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Feasibility3D — Spill intelligence",
  description: "Every spill found, measured and recorded.",
  applicationName: "Feasibility3D",
  appleWebApp: { capable: true, title: "Feasibility3D", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen antialiased">
        <PwaProvider>
          <SessionProvider>
            <Suspense fallback={null}>
              <AppShell>{children}</AppShell>
            </Suspense>
          </SessionProvider>
        </PwaProvider>
      </body>
    </html>
  );
}