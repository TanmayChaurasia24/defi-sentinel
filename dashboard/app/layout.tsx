import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeFi Sentinel — Autonomous Risk Monitor",
  description: "AI-powered autonomous DeFi risk monitoring agent for the Casper Network. Real-time wallet analysis, Claude AI decision-making, and automated rebalancing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
