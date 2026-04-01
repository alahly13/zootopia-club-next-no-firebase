import { APP_NAME, APP_TAGLINE } from "@zootopia/shared-config";
import type { Metadata } from "next";
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Arabic,
} from "next/font/google";
import type { ReactNode } from "react";

import { getRequestUiContext } from "@/lib/server/request-context";
import "./globals.css";

const latinFont = IBM_Plex_Sans({
  variable: "--font-latin",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

const arabicFont = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  fallback: ["Tahoma", "Arial", "sans-serif"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  fallback: ["Consolas", "Courier New", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_TAGLINE,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const { locale, direction, themeMode } = await getRequestUiContext();

  return (
    <html
      lang={locale}
      dir={direction}
      data-theme={themeMode}
      suppressHydrationWarning
      className={`${latinFont.variable} ${arabicFont.variable} ${monoFont.variable} antialiased`}
    >
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
