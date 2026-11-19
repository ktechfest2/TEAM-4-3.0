import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import { MotionConfigProvider } from "@/components/motion-config";
import "./globals.css";

const barlow = Barlow({ variable: "--font-barlow", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const barlowCondensed = Barlow_Condensed({ variable: "--font-barlow-condensed", subsets: ["latin"], weight: ["500", "600", "700", "800"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Confam Control Room", template: "%s · Confam Control Room" },
  description: "INEC control room for Confam, the voice line that verifies election rumours and calls voters in Surulere, Lagos.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9ede6" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1712" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <MotionConfigProvider>{children}</MotionConfigProvider>
      </body>
    </html>
  );
}
