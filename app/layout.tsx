import type { Metadata, Viewport } from "next";
import { Inter, Caladea } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const display = Caladea({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "ACNABIN FA Count | Fixed Asset Verification",
  description: "Mobile-first 100% physical count and verification against SAP FAR",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FA Count",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FAF9F4",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${display.variable} min-h-screen bg-cream text-slate-900 antialiased selection:bg-brand-100`}>
        {children}
      </body>
    </html>
  );
}

