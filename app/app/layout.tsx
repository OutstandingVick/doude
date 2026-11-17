import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import { AnalysisProvider } from "@/components/AnalysisProvider";
import { TopNav } from "@/components/TopNav";
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
          <div className="mx-8 my-8 min-h-[calc(100vh-4rem)] max-w-[1440px] rounded-[28px] border border-border bg-container p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
            <Suspense fallback={null}>
              <TopNav />
            </Suspense>
            <Suspense fallback={null}>{children}</Suspense>
          </div>
        </AnalysisProvider>
      </body>
    </html>
  );
}