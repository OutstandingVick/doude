import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import { AnalysisProvider } from "@/components/AnalysisProvider";
import { Sidebar } from "@/components/Sidebar";
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
          <div className="flex min-h-screen">
            <Suspense fallback={<div className="w-[248px] shrink-0" />}>
              <Sidebar />
            </Suspense>
            <div className="min-w-0 flex-1 p-6">{children}</div>
          </div>
        </AnalysisProvider>
      </body>
    </html>
  );
}