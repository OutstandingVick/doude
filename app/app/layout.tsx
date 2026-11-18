import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import { AnalysisProvider } from "@/components/AnalysisProvider";
import { TopNav } from "@/components/TopNav";
import { Sidebar } from "@/components/Sidebar";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Doude — Spill intelligence",
  description: "Every spill found, measured and recorded.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen antialiased">
        <AnalysisProvider>
          <div data-container className="mx-auto my-6 min-h-[calc(100vh-3rem)] w-[min(calc(100%-48px),1600px)] rounded-[28px] border border-border bg-container p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)] lg:h-[calc(100dvh-48px)] lg:overflow-hidden">
            <div className="flex h-full gap-6">
              <Suspense fallback={null}>
                <Sidebar />
              </Suspense>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <Suspense fallback={null}>
                  <TopNav />
                </Suspense>
                <div className="flex min-h-0 flex-1 flex-col">
                  <Suspense fallback={null}>{children}</Suspense>
                </div>
              </div>
            </div>
          </div>
        </AnalysisProvider>
      </body>
    </html>
  );
}