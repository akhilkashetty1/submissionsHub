import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import NavProgress from "@/components/NavProgress";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Submissions Hub", template: "%s · Submissions Hub" },
  description: "Ride Along and RoadShield submissions in one place.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <NavProgress />
        {children}
      </body>
    </html>
  );
}
