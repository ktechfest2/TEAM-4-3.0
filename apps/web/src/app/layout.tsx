import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { MotionConfigProvider } from "@/components/motion-config";
import "./globals.css";

const barlow = Barlow({ variable: "--font-barlow", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const barlowCondensed = Barlow_Condensed({ variable: "--font-barlow-condensed", subsets: ["latin"], weight: ["500", "600", "700", "800"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });
// Landing page: an editorial serif at light weights plus a quiet sans, deliberately unlike the control room's signage type.
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["300", "400", "500"], style: ["normal", "italic"] });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Confam: the election line for every phone", template: "%s · Confam" },
  description: "Call one number in your own language. Confam checks election rumours with the officials at the polling unit, calls voters when their polling unit changes, and tells anyone whether officials have arrived.",
  metadataBase: new URL(process.env.PUBLIC_WEB_URL ?? "https://web-production-13f1563e.up.railway.app"),
  openGraph: { images: ["/images/amara.jpg"] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9ede6" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1712" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} ${plexMono.variable} ${newsreader.variable} ${plexSans.variable} h-full antialiased`}>
      <head>
        {/* JS gate: elements that animate in are hidden only when JS runs, so content stays visible without it */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-full">
        <MotionConfigProvider>{children}</MotionConfigProvider>
      </body>
    </html>
  );
}
